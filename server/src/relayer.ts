import { erc20Abi, maxUint256, parseAbi, parseEther, serializeSignature, verifyTypedData, type Address, type Chain, type Hash, type PublicClient, type Transport } from "viem";
import {
  FaucetBody,
  LaunchBody,
  PermitDepositBody,
  TradeBody,
  WithdrawBody,
  btcPermitDomain,
  domainFor,
  faucetMessage,
  launchpadAbi,
  launchTypes,
  permitTypes,
  tradeTypes,
  vaultAbi,
  withdrawTypes,
  type Deployment,
  type TxStatus,
} from "shared";
import type { z } from "zod";
import { checkIssued, checkPersonalSig } from "./auth";
import { HttpError, simulationError } from "./errors";
import type { Hub } from "./hub";
import { errMessage, log } from "./log";
import { signCall, type Fees, type Sender, type SendFn } from "./sender";
import type { Store } from "./store";

export const FAUCET_AMOUNT = parseEther("1000");
export const FAUCET_PERIOD = 86400;
export const FAUCET_PER_IP = 3;

export const parseBody = <S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> => {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, "bad_body", issue ? `${issue.path.join(".")}: ${issue.message}` : "bad body");
  }
  return r.data;
};

export interface RelayerDeps {
  pub: PublicClient<Transport, Chain>;
  relayer: Sender;
  faucet: Sender | null;
  dep: Deployment;
  chainId: number;
  hub: Hub;
  store: Store;
  faucetHourlyCap: number;
  // first receipt poll, it backs off to pollMaxMs
  pollMs?: number;
  pollMaxMs?: number;
}

// what the chain decided about a sent tx
type Outcome = { hash: Hash; ok: boolean; error: string | null };

// a simulated request at a given nonce and gas, with the fees of a replacement when the watchdog bumps it
const at = <R extends object>(request: R, gas: bigint, nonce: number, fees?: Fees): R & { gas: bigint; nonce: number } => ({ ...request, gas, nonce, ...fees });
// the estimate runs against the current block, a new block can cost more (pool oracles write on their first trade)
const GAS_BUFFER_PCT = 130n;

const LOST_GRACE_MS = 1000;

const permitReadAbi = parseAbi([
  "function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])",
  "function nonces(address owner) view returns (uint256)",
  "function nonce(address owner) view returns (uint256)",
]);
type PermitDomain = { name: string; version: string; chainId: number; verifyingContract: Address };

const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

export class Relayer {
  private inFlight = new Set<string>();
  private approval: Promise<void> | null = null;
  private stopped = false;

  constructor(private d: RelayerDeps) {}

  stop() {
    this.stopped = true;
  }

  // taken synchronously before the first await so a duplicate POST can never reach the chain twice
  private lock(key: string): string {
    const k = key.toLowerCase();
    if (this.inFlight.has(k)) throw new HttpError(409, "in_flight", "the same action is already being sent");
    this.inFlight.add(k);
    return k;
  }

  // runs the checks under the lock. the lock passes to dispatch, which releases it once the chain decides
  private async locked(key: string, run: (lock: string) => Promise<TxStatus>): Promise<TxStatus> {
    const lock = this.lock(key);
    try {
      return await run(lock);
    } catch (e) {
      this.inFlight.delete(lock);
      throw e;
    }
  }

  private checkDeadline(deadline: string) {
    if (BigInt(deadline) <= nowSec()) throw new HttpError(400, "expired", "deadline has passed");
  }

  private vaultNonce(user: Address): Promise<bigint> {
    return this.d.pub.readContract({ address: this.d.dep.vault, abi: vaultAbi, functionName: "nonces", args: [user] });
  }

  private async checkNonce(user: Address, nonce: string) {
    const onChain = await this.vaultNonce(user);
    if (onChain !== BigInt(nonce)) throw new HttpError(400, "bad_nonce", `nonce must be ${onChain}`);
  }

  private checkSig(ok: boolean) {
    if (!ok) throw new HttpError(400, "bad_signature", "signature does not recover to user");
  }

  private async simulate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw simulationError(e);
    }
  }

  private async gas(request: Parameters<PublicClient<Transport, Chain>["estimateContractGas"]>[0]): Promise<bigint> {
    try {
      return ((await this.d.pub.estimateContractGas(request)) * GAS_BUFFER_PCT) / 100n;
    } catch (e) {
      throw simulationError(e);
    }
  }

  private pushTx(user: string, tx: TxStatus) {
    this.d.hub.publish(`user:${user.toLowerCase()}`, (topic) => ({ type: "tx", topic, tx }));
  }

  private async receipt(hashes: Hash[]): Promise<Outcome | null> {
    for (const h of hashes) {
      const r = await this.d.pub.getTransactionReceipt({ hash: h }).catch(() => null);
      if (r) return { hash: h, ok: r.status === "success", error: r.status === "success" ? null : "reverted" };
    }
    return null;
  }

  // polls until a receipt shows up for any hash sent at this nonce, or the chain proves none ever will:
  // the sender's nonce or the user's vault nonce moved past it without one of our hashes. null if stopped.
  async mined(sender: Sender, hash: Hash, vaultNonce?: { user: Address; nonce: bigint }): Promise<Outcome | null> {
    const nonce = sender.nonceOf(hash);
    let delay = this.d.pollMs ?? 500;
    const maxDelay = this.d.pollMaxMs ?? 4000;
    let lostAt: number | null = null;
    try {
      while (!this.stopped) {
        const hit = await this.receipt(sender.hashesFor(hash));
        if (hit) return hit;
        let lost: string | null = null;
        try {
          if (nonce !== null && (await sender.minedCount()) > nonce) lost = "dropped, the relayer nonce was used by another tx";
          else if (vaultNonce && (await this.vaultNonce(vaultNonce.user)) > vaultNonce.nonce) lost = "the signed nonce was used by another tx";
        } catch (e) {
          log("relayer.poll_error", { hash, error: errMessage(e) });
        }
        // the nonce must look passed on two polls a second apart, receipts can lag the nonce on some nodes
        if (lost && lostAt !== null && Date.now() - lostAt >= LOST_GRACE_MS) {
          return (await this.receipt(sender.hashesFor(hash))) ?? { hash, ok: false, error: lost };
        }
        lostAt = lost ? (lostAt ?? Date.now()) : null;
        if (lost) {
          await Bun.sleep(LOST_GRACE_MS);
          continue;
        }
        await Bun.sleep(delay);
        delay = Math.min(maxDelay, Math.ceil(delay * 1.5));
      }
      return null;
    } finally {
      sender.forget(hash);
    }
  }

  // queues the send and reports pending, then confirmed or failed, on user:<addr>
  private dispatch(
    kind: TxStatus["kind"],
    user: Address,
    sender: Sender,
    send: SendFn,
    opts: { lock?: string; onFail?: () => void; vaultNonce?: bigint } = {},
  ): TxStatus {
    const id = crypto.randomUUID();
    const status: TxStatus = { id, kind, status: "pending", hash: null, error: null };
    this.pushTx(user, status);
    const settle = (s: TxStatus) => {
      if (opts.lock) this.inFlight.delete(opts.lock);
      if (s.status === "failed") opts.onFail?.();
      this.pushTx(user, s);
      log("relayer.tx", { id, kind, user, status: s.status, hash: s.hash, error: s.error });
    };
    sender
      .submit(send)
      .then(async (hash) => {
        this.pushTx(user, { ...status, hash });
        const out = await this.mined(sender, hash, opts.vaultNonce === undefined ? undefined : { user, nonce: opts.vaultNonce });
        if (!out) return;
        settle({ ...status, hash: out.hash, status: out.ok ? "confirmed" : "failed", error: out.error });
      })
      .catch((e: unknown) => settle({ ...status, status: "failed", error: errMessage(e) }));
    return status;
  }

  trade(body: unknown): Promise<TxStatus> {
    const { trade: t, sig } = parseBody(TradeBody, body);
    this.checkDeadline(t.deadline);
    return this.locked(`${t.user}:${t.nonce}`, async (lock) => {
      await this.checkNonce(t.user, t.nonce);
      const message = { ...t, amountIn: BigInt(t.amountIn), minOut: BigInt(t.minOut), nonce: BigInt(t.nonce), deadline: BigInt(t.deadline) };
      const domain = domainFor(this.d.chainId, this.d.dep.vault);
      this.checkSig(await verifyTypedData({ address: t.user, domain, types: tradeTypes, primaryType: "Trade", message, signature: sig }).catch(() => false));
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeTrade", args: [message, sig] }),
      );
      const gas = await this.gas(request);
      return this.dispatch("trade", t.user, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), {
        lock,
        vaultNonce: message.nonce,
      });
    });
  }

  withdraw(body: unknown): Promise<TxStatus> {
    const { withdraw: w, sig } = parseBody(WithdrawBody, body);
    this.checkDeadline(w.deadline);
    return this.locked(`${w.user}:${w.nonce}`, async (lock) => {
      await this.checkNonce(w.user, w.nonce);
      const message = { ...w, amount: BigInt(w.amount), nonce: BigInt(w.nonce), deadline: BigInt(w.deadline) };
      const onCurve = await this.d.pub.readContract({ address: this.d.dep.launchpad, abi: launchpadAbi, functionName: "isCurve", args: [w.token] });
      if (onCurve) throw new HttpError(400, "curve_locked", "this coin is still on its curve and can't leave the vault until it graduates");
      const domain = domainFor(this.d.chainId, this.d.dep.vault);
      this.checkSig(await verifyTypedData({ address: w.user, domain, types: withdrawTypes, primaryType: "Withdraw", message, signature: sig }).catch(() => false));
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeWithdraw", args: [message, sig] }),
      );
      const gas = await this.gas(request);
      return this.dispatch("withdraw", w.user, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), {
        lock,
        vaultNonce: message.nonce,
      });
    });
  }

  launch(body: unknown): Promise<TxStatus> {
    const { launch: l, sig } = parseBody(LaunchBody, body);
    this.checkDeadline(l.deadline);
    return this.locked(`${l.user}:${l.nonce}`, async (lock) => {
      await this.checkNonce(l.user, l.nonce);
      const message = { ...l, initialBuy: BigInt(l.initialBuy), nonce: BigInt(l.nonce), deadline: BigInt(l.deadline) };
      const domain = domainFor(this.d.chainId, this.d.dep.vault);
      this.checkSig(await verifyTypedData({ address: l.user, domain, types: launchTypes, primaryType: "Launch", message, signature: sig }).catch(() => false));
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeLaunch", args: [message, sig] }),
      );
      const gas = await this.gas(request);
      return this.dispatch("launch", l.user, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), {
        lock,
        vaultNonce: message.nonce,
      });
    });
  }

  // the token's own permit domain and the owner's current permit nonce, read the same way the web signs.
  // MUSD has eip712Domain() and nonces(), the BTC precompile has neither, a fixed domain and nonce(owner)
  private async permitDomain(token: Address, owner: Address): Promise<{ domain: PermitDomain; nonce: bigint }> {
    const pub = this.d.pub;
    let domain: PermitDomain;
    try {
      const [, name, version, chainId, verifyingContract] = await pub.readContract({ address: token, abi: permitReadAbi, functionName: "eip712Domain" });
      domain = { name, version, chainId: Number(chainId), verifyingContract };
    } catch {
      const nonce = await pub.readContract({ address: token, abi: permitReadAbi, functionName: "nonce", args: [owner] });
      return { domain: btcPermitDomain(this.d.chainId, token), nonce };
    }
    return { domain, nonce: await pub.readContract({ address: token, abi: permitReadAbi, functionName: "nonces", args: [owner] }) };
  }

  // the vault only falls back to a standing allowance when permit() reverts, so the server checks the permit itself first
  deposit(body: unknown): Promise<TxStatus> {
    const p = parseBody(PermitDepositBody, body);
    const token = p.token.toLowerCase();
    if (token !== this.d.dep.musd.toLowerCase() && token !== this.d.dep.btc.toLowerCase())
      throw new HttpError(400, "bad_token", "only MUSD and BTC deposit with permit");
    if (BigInt(p.amount) === 0n) throw new HttpError(400, "bad_body", "amount must be positive");
    if (![0, 1, 27, 28].includes(p.v)) throw new HttpError(400, "bad_body", "v must be 27 or 28");
    if (p.r.length !== 66 || p.s.length !== 66) throw new HttpError(400, "bad_body", "r and s must be 32 bytes");
    this.checkDeadline(p.deadline);
    return this.locked(`${p.owner}:${p.token}`, async (lock) => {
      const v = p.v < 27 ? p.v + 27 : p.v;
      const { domain, nonce } = await this.permitDomain(p.token, p.owner);
      const message = { owner: p.owner, spender: this.d.dep.vault, value: BigInt(p.amount), nonce, deadline: BigInt(p.deadline) };
      const signature = serializeSignature({ r: p.r, s: p.s, v: BigInt(v) });
      const ok = await verifyTypedData({ address: p.owner, domain, types: permitTypes, primaryType: "Permit", message, signature }).catch(() => false);
      if (!ok) throw new HttpError(400, "bad_signature", "permit signature does not recover to owner");
      const args = [p.owner, p.token, BigInt(p.amount), BigInt(p.deadline), v, p.r, p.s] as const;
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "depositWithPermit", args }),
      );
      const gas = await this.gas(request);
      return this.dispatch("deposit", p.owner, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), { lock });
    });
  }

  private ensureApproval(faucet: Sender): Promise<void> {
    this.approval ??= (async () => {
      const allowance = await this.d.pub.readContract({ address: this.d.dep.musd, abi: erc20Abi, functionName: "allowance", args: [faucet.address, this.d.dep.vault] });
      if (allowance >= FAUCET_AMOUNT * 1000n) return;
      const call = { address: this.d.dep.musd, abi: erc20Abi, functionName: "approve", args: [this.d.dep.vault, maxUint256] } as const;
      const gas = await this.gas({ ...call, account: faucet.wallet.account });
      const hash = await faucet.submit((nonce, fees) => signCall(faucet.wallet, { ...call, gas, nonce, ...fees }));
      const r = await this.mined(faucet, hash);
      if (!r?.ok) throw new Error(`faucet approve ${r?.error ?? "did not finish"}`);
      log("faucet.approved", { hash: r.hash });
    })().catch((e: unknown) => {
      this.approval = null;
      throw e;
    });
    return this.approval;
  }

  async faucet(body: unknown, ip: string): Promise<TxStatus> {
    const faucet = this.d.faucet;
    if (!faucet) throw new HttpError(403, "faucet_off", "the faucet is off on this deployment");
    const { address, issued, sig } = parseBody(FaucetBody, body);
    checkIssued(issued);
    await checkPersonalSig(address, faucetMessage(address, issued), sig);
    const now = Math.floor(Date.now() / 1000);
    const claim = this.d.store.claimFaucet(address, ip, now, { period: FAUCET_PERIOD, perIp: FAUCET_PER_IP, hourly: this.d.faucetHourlyCap });
    if (claim === "address") throw new HttpError(429, "faucet_limited", "one faucet claim per address every 24 hours");
    if (claim === "ip") throw new HttpError(429, "faucet_ip_limited", `at most ${FAUCET_PER_IP} faucet claims per ip every 24 hours`);
    if (claim === "global") throw new HttpError(429, "faucet_busy", "the faucet hit its hourly cap, try again later");
    const release = () => this.d.store.releaseFaucet(address, now);
    try {
      await this.ensureApproval(faucet);
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: faucet.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "deposit", args: [this.d.dep.musd, FAUCET_AMOUNT, address] }),
      );
      const gas = await this.gas(request);
      return this.dispatch("faucet", address, faucet, (nonce, fees) => signCall(faucet.wallet, at(request, gas, nonce, fees)), { onFail: release });
    } catch (e) {
      release();
      throw e;
    }
  }
}

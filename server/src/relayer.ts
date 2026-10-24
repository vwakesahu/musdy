import { erc20Abi, hashTypedData, maxUint256, parseEther, serializeSignature, verifyTypedData, type Address, type Chain, type Hash, type PublicClient, type Transport } from "viem";
import {
  FaucetBody,
  IntentBody,
  intentTypes,
  LaunchBody,
  PermitDepositBody,
  TradeBody,
  WithdrawBody,
  domainFor,
  faucetMessage,
  launchpadAbi,
  launchTypes,
  permitTypes,
  readPermitDomain,
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

export const FAUCET_AMOUNT = parseEther(process.env.FAUCET_AMOUNT ?? "1000");
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
  pollMs?: number;
  pollMaxMs?: number;
}

type Outcome = { hash: Hash; ok: boolean; error: string | null };

// mezo testnet estimateGas can return far too little for these calls and gas costs almost nothing, so every send gets a floor
const GAS_FLOOR = 600_000n;
const LAUNCH_GAS_FLOOR = 5_000_000n;
const at = <R extends object>(request: R, gas: bigint, nonce: number, fees?: Fees): R & { gas: bigint; nonce: number } => ({ ...request, gas, nonce, ...fees });
// the estimate runs against the current block, a new block can cost more (pool oracles write on their first trade)
const GAS_BUFFER_PCT = 130n;

const LOST_GRACE_MS = 1000;

export const toUint = (v: string, name: string): bigint => {
  const n = BigInt(v);
  if (n > maxUint256) throw new HttpError(400, "bad_body", `${name}: does not fit a uint256`);
  return n;
};

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

  private async locked(key: string, run: (lock: string) => Promise<TxStatus>): Promise<TxStatus> {
    const lock = this.lock(key);
    try {
      return await run(lock);
    } catch (e) {
      this.inFlight.delete(lock);
      throw e;
    }
  }

  private checkDeadline(deadline: bigint) {
    if (deadline <= nowSec()) throw new HttpError(400, "expired", "deadline has passed");
  }

  private vaultNonce(user: Address): Promise<bigint> {
    return this.d.pub.readContract({ address: this.d.dep.vault, abi: vaultAbi, functionName: "nonces", args: [user] });
  }

  private async checkNonce(user: Address, nonce: bigint) {
    const onChain = await this.vaultNonce(user);
    if (onChain !== nonce) throw new HttpError(400, "bad_nonce", `nonce must be ${onChain}`);
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

  private async gas(request: Parameters<PublicClient<Transport, Chain>["estimateContractGas"]>[0], floor = GAS_FLOOR): Promise<bigint> {
    try {
      const est = ((await this.d.pub.estimateContractGas(request)) * GAS_BUFFER_PCT) / 100n;
      return est > floor ? est : floor;
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

  private dispatch(
    kind: TxStatus["kind"],
    user: Address,
    sender: Sender,
    send: SendFn,
    opts: { lock?: string; onFail?: () => void; vaultNonce?: bigint; id?: string; holdConfirm?: boolean } = {},
  ): TxStatus {
    const id = opts.id ?? crypto.randomUUID();
    const status: TxStatus = { id, kind, status: "pending", hash: null, error: null };
    this.pushTx(user, status);
    const settle = (s: TxStatus) => {
      if (opts.lock) this.inFlight.delete(opts.lock);
      if (s.status === "failed") opts.onFail?.();
      if (!(opts.holdConfirm && s.status === "confirmed")) this.pushTx(user, s);
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

  private async checkVaultSig(user: Address, primaryType: "Trade" | "Withdraw" | "Launch" | "Intent", types: object, message: object, sig: `0x${string}`) {
    const domain = domainFor(this.d.chainId, this.d.dep.vault);
    const args = { address: user, domain, types, primaryType, message, signature: sig } as Parameters<typeof verifyTypedData>[0];
    this.checkSig(await verifyTypedData(args).catch(() => false));
  }

  // the signature is checked before the lock so a third party can't 409 a victim, then the lock is taken with no await in between
  async trade(body: unknown): Promise<TxStatus> {
    const { trade: t, sig } = parseBody(TradeBody, body);
    const message = {
      ...t,
      amountIn: toUint(t.amountIn, "trade.amountIn"),
      minOut: toUint(t.minOut, "trade.minOut"),
      nonce: toUint(t.nonce, "trade.nonce"),
      deadline: toUint(t.deadline, "trade.deadline"),
    };
    this.checkDeadline(message.deadline);
    await this.checkVaultSig(t.user, "Trade", tradeTypes, message, sig);
    return this.locked(`${t.user}:${message.nonce}`, async (lock) => {
      await this.checkNonce(t.user, message.nonce);
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

  // the tx id is the intent id, the solver sends the final confirmed or failed once it settles
  async intent(body: unknown, check: (i: { user: Address; isBuy: boolean; chainId: number; token: string; amountIn: bigint }) => void | Promise<void>): Promise<TxStatus> {
    const { intent: it, sig } = parseBody(IntentBody, body);
    const message = {
      ...it,
      chainId: toUint(it.chainId, "intent.chainId"),
      amountIn: toUint(it.amountIn, "intent.amountIn"),
      minOut: toUint(it.minOut, "intent.minOut"),
      nonce: toUint(it.nonce, "intent.nonce"),
      deadline: toUint(it.deadline, "intent.deadline"),
    };
    if (message.amountIn === 0n) throw new HttpError(400, "bad_body", "intent.amountIn: must be positive");
    this.checkDeadline(message.deadline);
    await check({ user: it.user, isBuy: it.isBuy, chainId: Number(message.chainId), token: it.token, amountIn: message.amountIn });
    await this.checkVaultSig(it.user, "Intent", intentTypes, message, sig);
    const id = hashTypedData({ domain: domainFor(this.d.chainId, this.d.dep.vault), types: intentTypes, primaryType: "Intent", message });
    return this.locked(`${it.user}:${message.nonce}`, async (lock) => {
      await this.checkNonce(it.user, message.nonce);
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeIntent", args: [message, sig] }),
      );
      const gas = await this.gas(request);
      return this.dispatch("intent", it.user, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), {
        lock,
        vaultNonce: message.nonce,
        id,
        holdConfirm: true,
      });
    });
  }

  async withdraw(body: unknown): Promise<TxStatus> {
    const { withdraw: w, sig } = parseBody(WithdrawBody, body);
    const message = { ...w, amount: toUint(w.amount, "withdraw.amount"), nonce: toUint(w.nonce, "withdraw.nonce"), deadline: toUint(w.deadline, "withdraw.deadline") };
    this.checkDeadline(message.deadline);
    await this.checkVaultSig(w.user, "Withdraw", withdrawTypes, message, sig);
    return this.locked(`${w.user}:${message.nonce}`, async (lock) => {
      await this.checkNonce(w.user, message.nonce);
      const onCurve = await this.d.pub.readContract({ address: this.d.dep.launchpad, abi: launchpadAbi, functionName: "isCurve", args: [w.token] });
      if (onCurve) throw new HttpError(400, "curve_locked", "this coin is still on its curve and can't leave the vault until it graduates");
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

  async launch(body: unknown): Promise<TxStatus> {
    const { launch: l, sig } = parseBody(LaunchBody, body);
    const message = { ...l, initialBuy: toUint(l.initialBuy, "launch.initialBuy"), nonce: toUint(l.nonce, "launch.nonce"), deadline: toUint(l.deadline, "launch.deadline") };
    this.checkDeadline(message.deadline);
    await this.checkVaultSig(l.user, "Launch", launchTypes, message, sig);
    return this.locked(`${l.user}:${message.nonce}`, async (lock) => {
      await this.checkNonce(l.user, message.nonce);
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeLaunch", args: [message, sig] }),
      );
      const gas = await this.gas(request, LAUNCH_GAS_FLOOR);
      return this.dispatch("launch", l.user, this.d.relayer, (nonce, fees) => signCall(this.d.relayer.wallet, at(request, gas, nonce, fees)), {
        lock,
        vaultNonce: message.nonce,
      });
    });
  }

  // the vault falls back to a standing allowance when permit() reverts, so the permit must be verified here first
  async deposit(body: unknown): Promise<TxStatus> {
    const p = parseBody(PermitDepositBody, body);
    const token = p.token.toLowerCase();
    if (token !== this.d.dep.musd.toLowerCase() && token !== this.d.dep.btc.toLowerCase())
      throw new HttpError(400, "bad_token", "only MUSD and BTC deposit with permit");
    const amount = toUint(p.amount, "amount");
    const deadline = toUint(p.deadline, "deadline");
    if (amount === 0n) throw new HttpError(400, "bad_body", "amount must be positive");
    if (![0, 1, 27, 28].includes(p.v)) throw new HttpError(400, "bad_body", "v must be 27 or 28");
    if (p.r.length !== 66 || p.s.length !== 66) throw new HttpError(400, "bad_body", "r and s must be 32 bytes");
    this.checkDeadline(deadline);
    const v = p.v < 27 ? p.v + 27 : p.v;
    const read = () => readPermitDomain(this.d.pub, this.d.chainId, p.token, p.owner).catch((e: unknown) => {
      throw simulationError(e);
    });
    const { domain, nonce } = await read();
    const message = { owner: p.owner, spender: this.d.dep.vault, value: amount, nonce, deadline };
    const signature = serializeSignature({ r: p.r, s: p.s, v: BigInt(v) });
    const ok = await verifyTypedData({ address: p.owner, domain, types: permitTypes, primaryType: "Permit", message, signature }).catch(() => false);
    if (!ok) throw new HttpError(400, "bad_signature", "permit signature does not recover to owner");
    return this.locked(`${p.owner}:${p.token}`, async (lock) => {
      // a copy of this permit may have been spent while it was being verified
      if ((await read()).nonce !== nonce) throw new HttpError(400, "bad_signature", "permit nonce was already used");
      const args = [p.owner, p.token, amount, deadline, v, p.r, p.s] as const;
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

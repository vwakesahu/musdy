import { erc20Abi, maxUint256, parseEther, verifyTypedData, type Address, type Chain, type Hash, type PublicClient, type Transport } from "viem";
import {
  FaucetBody,
  LaunchBody,
  PermitDepositBody,
  TradeBody,
  WithdrawBody,
  domainFor,
  launchpadAbi,
  launchTypes,
  tradeTypes,
  vaultAbi,
  withdrawTypes,
  type Deployment,
  type TxStatus,
} from "shared";
import type { z } from "zod";
import { HttpError, simulationError } from "./errors";
import type { Hub } from "./hub";
import { errMessage, log } from "./log";
import type { Sender } from "./sender";
import type { Store } from "./store";

export const FAUCET_AMOUNT = parseEther("1000");
export const FAUCET_PERIOD = 86400;

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
}

const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

export class Relayer {
  private inFlight = new Set<string>();
  private approval: Promise<void> | null = null;

  constructor(private d: RelayerDeps) {}

  private checkDeadline(deadline: string) {
    if (BigInt(deadline) <= nowSec()) throw new HttpError(400, "expired", "deadline has passed");
  }

  private async checkNonce(user: Address, nonce: string) {
    const onChain = await this.d.pub.readContract({ address: this.d.dep.vault, abi: vaultAbi, functionName: "nonces", args: [user] });
    if (onChain !== BigInt(nonce)) throw new HttpError(400, "bad_nonce", `nonce must be ${onChain}`);
    if (this.inFlight.has(`${user.toLowerCase()}:${nonce}`)) throw new HttpError(409, "nonce_in_flight", "an action with this nonce is already being sent");
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

  private pushTx(user: string, tx: TxStatus) {
    this.d.hub.publish(`user:${user.toLowerCase()}`, (topic) => ({ type: "tx", topic, tx }));
  }

  // queues the send and reports pending, then confirmed or failed, on user:<addr>
  private dispatch(
    kind: TxStatus["kind"],
    user: Address,
    sender: Sender,
    send: (nonce: number) => Promise<Hash>,
    opts: { lock?: string; onFail?: () => void } = {},
  ): TxStatus {
    const id = crypto.randomUUID();
    const status: TxStatus = { id, kind, status: "pending", hash: null, error: null };
    if (opts.lock) this.inFlight.add(opts.lock);
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
        const receipt = await this.d.pub.waitForTransactionReceipt({ hash });
        settle({ ...status, hash, status: receipt.status === "success" ? "confirmed" : "failed", error: receipt.status === "success" ? null : "reverted" });
      })
      .catch((e: unknown) => settle({ ...status, status: "failed", error: errMessage(e) }));
    return status;
  }

  async trade(body: unknown): Promise<TxStatus> {
    const { trade: t, sig } = parseBody(TradeBody, body);
    this.checkDeadline(t.deadline);
    await this.checkNonce(t.user, t.nonce);
    const message = { ...t, amountIn: BigInt(t.amountIn), minOut: BigInt(t.minOut), nonce: BigInt(t.nonce), deadline: BigInt(t.deadline) };
    const domain = domainFor(this.d.chainId, this.d.dep.vault);
    this.checkSig(await verifyTypedData({ address: t.user, domain, types: tradeTypes, primaryType: "Trade", message, signature: sig }).catch(() => false));
    const { request } = await this.simulate(() =>
      this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeTrade", args: [message, sig] }),
    );
    return this.dispatch("trade", t.user, this.d.relayer, (nonce) => this.d.relayer.wallet.writeContract({ ...request, nonce }), {
      lock: `${t.user.toLowerCase()}:${t.nonce}`,
    });
  }

  async withdraw(body: unknown): Promise<TxStatus> {
    const { withdraw: w, sig } = parseBody(WithdrawBody, body);
    this.checkDeadline(w.deadline);
    await this.checkNonce(w.user, w.nonce);
    const message = { ...w, amount: BigInt(w.amount), nonce: BigInt(w.nonce), deadline: BigInt(w.deadline) };
    const onCurve = await this.d.pub.readContract({ address: this.d.dep.launchpad, abi: launchpadAbi, functionName: "isCurve", args: [w.token] });
    if (onCurve) throw new HttpError(400, "curve_locked", "this coin is still on its curve and can't leave the vault until it graduates");
    const domain = domainFor(this.d.chainId, this.d.dep.vault);
    this.checkSig(await verifyTypedData({ address: w.user, domain, types: withdrawTypes, primaryType: "Withdraw", message, signature: sig }).catch(() => false));
    const { request } = await this.simulate(() =>
      this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeWithdraw", args: [message, sig] }),
    );
    return this.dispatch("withdraw", w.user, this.d.relayer, (nonce) => this.d.relayer.wallet.writeContract({ ...request, nonce }), {
      lock: `${w.user.toLowerCase()}:${w.nonce}`,
    });
  }

  async launch(body: unknown): Promise<TxStatus> {
    const { launch: l, sig } = parseBody(LaunchBody, body);
    this.checkDeadline(l.deadline);
    await this.checkNonce(l.user, l.nonce);
    const message = { ...l, initialBuy: BigInt(l.initialBuy), nonce: BigInt(l.nonce), deadline: BigInt(l.deadline) };
    const domain = domainFor(this.d.chainId, this.d.dep.vault);
    this.checkSig(await verifyTypedData({ address: l.user, domain, types: launchTypes, primaryType: "Launch", message, signature: sig }).catch(() => false));
    const { request } = await this.simulate(() =>
      this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "executeLaunch", args: [message, sig] }),
    );
    return this.dispatch("launch", l.user, this.d.relayer, (nonce) => this.d.relayer.wallet.writeContract({ ...request, nonce }), {
      lock: `${l.user.toLowerCase()}:${l.nonce}`,
    });
  }

  // the permit is already signed by the owner, the vault checks it inside depositWithPermit
  async deposit(body: unknown): Promise<TxStatus> {
    const p = parseBody(PermitDepositBody, body);
    const token = p.token.toLowerCase();
    if (token !== this.d.dep.musd.toLowerCase() && token !== this.d.dep.btc.toLowerCase())
      throw new HttpError(400, "bad_token", "only MUSD and BTC deposit with permit");
    if (BigInt(p.amount) === 0n) throw new HttpError(400, "bad_body", "amount must be positive");
    if (![0, 1, 27, 28].includes(p.v)) throw new HttpError(400, "bad_body", "v must be 27 or 28");
    if (p.r.length !== 66 || p.s.length !== 66) throw new HttpError(400, "bad_body", "r and s must be 32 bytes");
    this.checkDeadline(p.deadline);
    const v = p.v < 27 ? p.v + 27 : p.v;
    const args = [p.owner, p.token, BigInt(p.amount), BigInt(p.deadline), v, p.r, p.s] as const;
    const { request } = await this.simulate(() =>
      this.d.pub.simulateContract({ account: this.d.relayer.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "depositWithPermit", args }),
    );
    return this.dispatch("deposit", p.owner, this.d.relayer, (nonce) => this.d.relayer.wallet.writeContract({ ...request, nonce }));
  }

  private ensureApproval(faucet: Sender): Promise<void> {
    this.approval ??= (async () => {
      const allowance = await this.d.pub.readContract({ address: this.d.dep.musd, abi: erc20Abi, functionName: "allowance", args: [faucet.address, this.d.dep.vault] });
      if (allowance >= FAUCET_AMOUNT * 1000n) return;
      const hash = await faucet.submit((nonce) =>
        faucet.wallet.writeContract({ address: this.d.dep.musd, abi: erc20Abi, functionName: "approve", args: [this.d.dep.vault, maxUint256], nonce }),
      );
      const r = await this.d.pub.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("faucet approve reverted");
      log("faucet.approved", { hash });
    })().catch((e: unknown) => {
      this.approval = null;
      throw e;
    });
    return this.approval;
  }

  async faucet(body: unknown): Promise<TxStatus> {
    const faucet = this.d.faucet;
    if (!faucet) throw new HttpError(403, "faucet_off", "the faucet is off on this deployment");
    const { address } = parseBody(FaucetBody, body);
    const now = Math.floor(Date.now() / 1000);
    if (!this.d.store.claimFaucet(address, now, now - FAUCET_PERIOD))
      throw new HttpError(429, "faucet_limited", "one faucet claim per address every 24 hours");
    const release = () => this.d.store.releaseFaucet(address, now);
    try {
      await this.ensureApproval(faucet);
      const { request } = await this.simulate(() =>
        this.d.pub.simulateContract({ account: faucet.wallet.account, address: this.d.dep.vault, abi: vaultAbi, functionName: "deposit", args: [this.d.dep.musd, FAUCET_AMOUNT, address] }),
      );
      return this.dispatch("faucet", address, faucet, (nonce) => faucet.wallet.writeContract({ ...request, nonce }), { onFail: release });
    } catch (e) {
      release();
      throw e;
    }
  }
}

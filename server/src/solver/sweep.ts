import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  parseSignature,
  recoverTypedDataAddress,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
} from "viem";
import { arbitrum, base, mainnet, optimism } from "viem/chains";
import { SweepBody, transferWithAuthorizationTypes, type TxStatus } from "shared";
import { HttpError, simulationError } from "../errors";
import type { Hub } from "../hub";
import { errMessage, log } from "../log";
import { parseBody } from "../relayer";
import { USDC_TO_MUSD, type SweepRoute } from "./config";
import type { Deposits } from "./deposits";
import type { SolverStore, SweepRow } from "./store";

export const usdcAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

export type Authorization = { from: Address; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex; sig: Hex };
export type External = { chainId: number; token: Address; amount: string };
type Domain = { name: string; version: string };

export interface UsdcChain {
  readonly chainId: number;
  readonly name: string;
  readonly token: Address;
  domain(): Promise<Domain>;
  balances(owners: Address[]): Promise<bigint[]>;
  used(owner: Address, nonce: Hex): Promise<boolean>;
  gas(): Promise<bigint>;
  prepare(a: Authorization): Promise<void>;
  submit(a: Authorization): Promise<Hash>;
  mined(hash: Hash): Promise<boolean | null>;
}

const VIEM_CHAINS: Record<number, Chain> = { [base.id]: base, [arbitrum.id]: arbitrum, [optimism.id]: optimism, [mainnet.id]: mainnet };
const MIN_LEAD_S = 60n;
const lc = (a: string) => a.toLowerCase();
const nowS = () => BigInt(Math.floor(Date.now() / 1000));

export const sweepId = (chainId: number, nonce: string) => `sweep:${chainId}:${lc(nonce)}`;

const authArgs = (a: Authorization) => {
  const { r, s, v, yParity } = parseSignature(a.sig);
  return [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, Number(v ?? BigInt(yParity + 27)), r, s] as const;
};

export const authorizationSigner = (chainId: number, token: Address, domain: Domain, a: Authorization): Promise<Address> =>
  recoverTypedDataAddress({
    domain: { ...domain, chainId, verifyingContract: token },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: { from: a.from, to: a.to, value: a.value, validAfter: a.validAfter, validBefore: a.validBefore, nonce: a.nonce },
    signature: a.sig,
  });

export class LiveUsdcChain implements UsdcChain {
  readonly chainId: number;
  readonly name: string;
  readonly token: Address;
  private pub;
  private wallet;
  private dom: Promise<Domain> | null = null;

  constructor(route: SweepRoute, url: string, account: Account) {
    this.chainId = route.chainId;
    this.name = route.name;
    this.token = getAddress(route.token);
    const chain: Chain = { ...VIEM_CHAINS[route.chainId]!, rpcUrls: { default: { http: [url] } } };
    this.pub = createPublicClient({ chain, transport: http(url, { retryCount: 2, timeout: 15_000 }) });
    this.wallet = createWalletClient({ chain, transport: http(url, { timeout: 15_000 }), account });
  }

  domain(): Promise<Domain> {
    this.dom ??= Promise.all([
      this.pub.readContract({ address: this.token, abi: usdcAbi, functionName: "name" }),
      this.pub.readContract({ address: this.token, abi: usdcAbi, functionName: "version" }),
    ])
      .then(([name, version]) => ({ name, version }))
      .catch((e: unknown) => {
        this.dom = null;
        throw e;
      });
    return this.dom;
  }

  async balances(owners: Address[]): Promise<bigint[]> {
    const out: bigint[] = [];
    for (let i = 0; i < owners.length; i += 100) {
      const part = owners.slice(i, i + 100);
      out.push(...(await this.pub.multicall({ contracts: part.map((o) => ({ address: this.token, abi: usdcAbi, functionName: "balanceOf", args: [o] }) as const), allowFailure: false })));
    }
    return out;
  }

  used(owner: Address, nonce: Hex): Promise<boolean> {
    return this.pub.readContract({ address: this.token, abi: usdcAbi, functionName: "authorizationState", args: [owner, nonce] });
  }

  gas(): Promise<bigint> {
    return this.pub.getBalance({ address: this.wallet.account.address });
  }

  async prepare(a: Authorization) {
    const have = await this.gas();
    const noGas = () => {
      log("sweep.solver_no_gas", { chainId: this.chainId, solver: this.wallet.account.address, have: have.toString() });
      return new HttpError(503, "solver_no_gas", `The solver has no gas on ${this.name} right now, your USDC stays put. Try again later.`);
    };
    if (have === 0n) throw noGas();
    let gas: bigint;
    try {
      gas = await this.pub.estimateContractGas({ address: this.token, abi: usdcAbi, functionName: "transferWithAuthorization", args: authArgs(a), account: this.wallet.account });
    } catch (e) {
      throw simulationError(e);
    }
    const fees = await this.pub.estimateFeesPerGas();
    if (have < (gas * fees.maxFeePerGas * 13n) / 10n) throw noGas();
  }

  submit(a: Authorization): Promise<Hash> {
    return this.wallet.writeContract({ address: this.token, abi: usdcAbi, functionName: "transferWithAuthorization", args: authArgs(a) });
  }

  mined(hash: Hash): Promise<boolean | null> {
    return this.pub.waitForTransactionReceipt({ hash, timeout: 120_000 }).then(
      (r) => r.status === "success",
      () => null,
    );
  }
}

// usdc in each watched user's own address on the sweep chains, read in one multicall per chain
export class ExternalUsdc {
  private bal = new Map<string, External[]>();
  private at = new Map<string, number>();
  private errs = new Map<number, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private soon: ReturnType<typeof setTimeout> | null = null;
  private busy: Promise<void> | null = null;

  constructor(private d: { chains: UsdcChain[]; watched: () => string[]; onChange: (addr: string) => void; everyMs?: number }) {}

  private get every() {
    return this.d.everyMs ?? 20_000;
  }

  start() {
    this.timer = setInterval(() => void this.poll(), Math.min(5_000, this.every));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
    this.timer = this.soon = null;
  }

  get(addr: string): External[] {
    return this.bal.get(lc(addr)) ?? [];
  }

  touch(addr: string) {
    if (Date.now() - (this.at.get(lc(addr)) ?? 0) < this.every || this.soon) return;
    this.soon = setTimeout(() => {
      this.soon = null;
      void this.poll();
    }, 250);
  }

  refresh(addr: string) {
    this.at.delete(lc(addr));
    this.touch(addr);
  }

  poll(): Promise<void> {
    this.busy ??= this.run().finally(() => (this.busy = null));
    return this.busy;
  }

  private async run() {
    const watched = new Set(this.d.watched().map(lc));
    for (const a of this.bal.keys()) if (!watched.has(a)) this.bal.delete(a);
    for (const a of this.at.keys()) if (!watched.has(a)) this.at.delete(a);
    const t = Date.now();
    const due = [...watched].filter((a) => t - (this.at.get(a) ?? 0) >= this.every);
    if (!due.length) return;
    const owners = due.map((a) => getAddress(a));
    const results = await Promise.all(this.d.chains.map((c) => this.read(c, owners)));
    due.forEach((a, i) => {
      this.at.set(a, t);
      const prev = this.bal.get(a) ?? [];
      const next: External[] = [];
      this.d.chains.forEach((c, j) => {
        const amount = results[j]?.[i] ?? BigInt(prev.find((p) => p.chainId === c.chainId)?.amount ?? 0);
        if (amount > 0n) next.push({ chainId: c.chainId, token: c.token, amount: amount.toString() });
      });
      this.bal.set(a, next);
      if (JSON.stringify(next) !== JSON.stringify(prev)) this.d.onChange(a);
    });
  }

  private async read(c: UsdcChain, owners: Address[]): Promise<bigint[] | null> {
    try {
      const r = await c.balances(owners);
      this.errs.delete(c.chainId);
      return r;
    } catch (e) {
      const m = errMessage(e);
      if (this.errs.get(c.chainId) !== m) log("sweep.balance_error", { chainId: c.chainId, error: m });
      this.errs.set(c.chainId, m);
      return null;
    }
  }
}

export interface SweepDeps {
  chains: UsdcChain[];
  store: SolverStore;
  hub: Hub;
  deposits: Deposits;
  solver: Address;
  musdWallet: () => Promise<bigint>;
  external?: ExternalUsdc | null;
  retryMs?: number;
}

export class Sweeps {
  private chains: Map<number, UsdcChain>;
  private running = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private d: SweepDeps) {
    this.chains = new Map(d.chains.map((c) => [c.chainId, c]));
  }

  start() {
    this.timer = setInterval(() => this.resume(), this.d.retryMs ?? 30_000);
    this.resume();
    void this.inventory();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private resume() {
    for (const r of this.d.store.openSweeps()) this.kick(r.id);
  }

  async inventory() {
    const musd = await this.d.musdWallet().catch(() => null);
    if (musd === null || musd < 10n * 10n ** 18n) log("sweep.solver_low_musd", { solver: this.d.solver, musd: musd?.toString() ?? "unreadable" });
    for (const c of this.chains.values()) {
      const gas = await c.gas().catch(() => null);
      log(gas ? "sweep.inventory" : "sweep.solver_no_gas", { chainId: c.chainId, solver: this.d.solver, gasWei: gas?.toString() ?? "unreadable" });
    }
  }

  private pushTx(user: string, tx: TxStatus) {
    this.d.hub.publish(`user:${lc(user)}`, (topic) => ({ type: "tx", topic, tx }));
  }

  private statusOf(r: SweepRow): TxStatus {
    if (r.status === "failed") return { id: r.id, kind: "bridge", status: "failed", hash: null, error: r.error };
    const fill = r.status === "credited" ? this.d.store.fill(r.id) : null;
    const done = fill?.status === "confirmed" ? "confirmed" : fill?.status === "failed" ? "failed" : "pending";
    return { id: r.id, kind: "bridge", status: done, hash: (fill?.hash as Hash | null) ?? null, error: fill?.error ?? null };
  }

  async accept(body: unknown): Promise<TxStatus> {
    const b = parseBody(SweepBody, body);
    const chain = this.chains.get(b.chainId);
    if (!chain) throw new HttpError(400, "bad_chain", `chainId: USDC sweeps come from ${[...this.chains.keys()].join(", ")}`);
    if (lc(b.token) !== lc(chain.token)) throw new HttpError(400, "bad_token", `token: only native USDC on ${chain.name} is swept`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(b.nonce)) throw new HttpError(400, "bad_body", "nonce: must be 32 bytes");
    const id = sweepId(b.chainId, b.nonce);
    const prior = this.d.store.sweep(id);
    if (prior) return this.statusOf(prior);
    const owner = getAddress(b.owner);
    const a: Authorization = { from: owner, to: this.d.solver, value: BigInt(b.value), validAfter: BigInt(b.validAfter), validBefore: BigInt(b.validBefore), nonce: b.nonce, sig: b.sig };
    if (a.value === 0n) throw new HttpError(400, "bad_body", "value: must be positive");
    if (a.validBefore < nowS() + MIN_LEAD_S) throw new HttpError(400, "expired", "validBefore: the authorization expires too soon");
    if (a.validAfter > nowS()) throw new HttpError(400, "too_early", "validAfter: the authorization is not valid yet");
    const domain = await chain.domain().catch((e: unknown) => {
      throw new HttpError(502, "rpc_error", `can't read the USDC domain on ${chain.name}: ${errMessage(e)}`);
    });
    const signer = await authorizationSigner(chain.chainId, chain.token, domain, a).catch(() => null);
    if (signer !== owner) throw new HttpError(400, "bad_signature", "the authorization is not signed by owner to the solver address");
    const [held, used] = await Promise.all([chain.balances([owner]), chain.used(owner, a.nonce)]).catch((e: unknown) => {
      throw new HttpError(502, "rpc_error", `can't read USDC on ${chain.name}: ${errMessage(e)}`);
    });
    if (a.value > held[0]!) throw new HttpError(400, "insufficient_balance", `owner holds less USDC on ${chain.name} than value`);
    if (used) throw new HttpError(409, "authorization_used", "this authorization was already used");
    const owed = (this.d.store.owedUsdc() + a.value) * USDC_TO_MUSD;
    const have = await this.d.musdWallet();
    if (have < owed) {
      log("sweep.solver_low_musd", { solver: this.d.solver, have: have.toString(), owed: owed.toString(), user: owner, chainId: chain.chainId });
      this.pushTx(owner, { id, kind: "bridge", status: "failed", hash: null, error: "solver low on MUSD" });
      throw new HttpError(503, "solver_low_musd", "The solver is low on MUSD right now, your USDC stays in your wallet. Try again later.");
    }
    await chain.prepare(a);
    const fresh = this.d.store.addSweep({ id, user: owner, chain_id: chain.chainId, token: chain.token, value: a.value.toString(), valid_after: b.validAfter, valid_before: b.validBefore, nonce: b.nonce, sig: b.sig });
    if (!fresh) return this.statusOf(this.d.store.sweep(id)!);
    log("sweep.accepted", { id, user: owner, chainId: chain.chainId, value: a.value.toString() });
    const tx: TxStatus = { id, kind: "bridge", status: "pending", hash: null, error: null };
    this.pushTx(owner, tx);
    this.kick(id);
    return tx;
  }

  private kick(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    void this.drive(id)
      .catch((e: unknown) => log("sweep.error", { id, error: errMessage(e) }))
      .finally(() => this.running.delete(id));
  }

  private failed(r: SweepRow, error: string) {
    this.d.store.setSweep(r.id, "failed", null, error);
    this.pushTx(r.user, { id: r.id, kind: "bridge", status: "failed", hash: null, error });
    log("sweep.failed", { id: r.id, error });
  }

  private async drive(id: string) {
    let r = this.d.store.sweep(id);
    const chain = r && this.chains.get(r.chain_id);
    if (!r || !chain) return;
    const owner = getAddress(r.user);
    const nonce = r.nonce as Hex;
    if (r.status === "pending") {
      if (await chain.used(owner, nonce)) this.d.store.setSweep(id, "received", null);
      else if (BigInt(r.valid_before) <= nowS()) return this.failed(r, "the authorization expired before it was sent");
      else {
        const a: Authorization = { from: owner, to: this.d.solver, value: BigInt(r.value), validAfter: BigInt(r.valid_after), validBefore: BigInt(r.valid_before), nonce, sig: r.sig as Hex };
        const hash = await chain.submit(a);
        this.d.store.setSweep(id, "submitted", hash);
        log("sweep.submitted", { id, chainId: chain.chainId, hash });
      }
      r = this.d.store.sweep(id)!;
    }
    if (r.status === "submitted") {
      const ok = await chain.mined(r.hash as Hash);
      if (ok === null) return;
      if (!ok && !(await chain.used(owner, nonce))) return this.failed(r, `the USDC transfer reverted on ${chain.name}`);
      this.d.store.setSweep(id, "received", null);
      r = this.d.store.sweep(id)!;
    }
    if (r.status === "received") {
      const row = r;
      this.d.store.store.tx(() => {
        this.d.store.addFill({ requestId: row.id, user: row.user, chainId: row.chain_id, address: row.user, usdc: BigInt(row.value), status: "pending" });
        this.d.store.setSweep(row.id, "credited", null);
      });
      log("sweep.received", { id, chainId: chain.chainId, value: r.value });
      this.d.external?.refresh(r.user);
      await this.d.deposits.creditPending();
    }
  }
}

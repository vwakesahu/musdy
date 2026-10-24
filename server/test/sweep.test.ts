import { describe, expect, test } from "bun:test";
import type { Address, Hash, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { transferWithAuthorizationTypes, type ServerMsg } from "shared";
import { openDb } from "../src/db";
import { HttpError } from "../src/errors";
import { Hub } from "../src/hub";
import { BASE, BASE_USDC } from "../src/solver/config";
import { Deposits } from "../src/solver/deposits";
import type { MezoOps } from "../src/solver/mezo";
import { SolverStore } from "../src/solver/store";
import { authorizationSigner, ExternalUsdc, sweepId, Sweeps, type Authorization, type UsdcChain } from "../src/solver/sweep";
import { Store } from "../src/store";
import { tempDb } from "./helpers/anvil";
import { FakeRelay } from "./helpers/relay";

const SOLVER = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as Address;
const DOMAIN = { name: "USD Coin", version: "2" };
const WAD = 10n ** 18n;

const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
};

class FakeChain implements UsdcChain {
  name = "Base";
  token = BASE_USDC as Address;
  held = new Map<string, bigint>();
  usedNonces = new Set<string>();
  submits: Authorization[] = [];
  gasWei = 10n ** 15n;
  constructor(readonly chainId = BASE) {}
  async domain() {
    return DOMAIN;
  }
  async balances(owners: Address[]) {
    return owners.map((o) => this.held.get(o.toLowerCase()) ?? 0n);
  }
  async used(_owner: Address, nonce: Hex) {
    return this.usedNonces.has(nonce);
  }
  async gas() {
    return this.gasWei;
  }
  async prepare() {
    if (this.gasWei === 0n) throw new HttpError(503, "solver_no_gas", "no gas");
  }
  async submit(a: Authorization) {
    this.submits.push(a);
    this.usedNonces.add(a.nonce);
    return `0x${"ab".repeat(32)}` as Hash;
  }
  async mined() {
    return true;
  }
}

class FakeOps {
  address = SOLVER;
  deposits: [bigint, string][] = [];
  async deposit(amount: bigint, user: Address, onSent?: (h: Hash) => void) {
    this.deposits.push([amount, user]);
    onSent?.("0xdef");
    return { hash: "0xdef" as Hash, ok: true, error: null };
  }
}

const rig = (musd = 500n * WAD) => {
  const sstore = new SolverStore(new Store(openDb(tempDb())));
  const sent: ServerMsg[] = [];
  const hub = new Hub({ welcome: () => ({ type: "welcome", serverTime: 0, block: 0, chainId: 31337 }), replay: () => null });
  hub.publish = (topic, make) => void sent.push(make(topic));
  const ops = new FakeOps();
  const deposits = new Deposits({ relay: new FakeRelay(), store: sstore, hub, ops: ops as unknown as MezoOps });
  const chain = new FakeChain();
  const sweeps = new Sweeps({ chains: [chain], store: sstore, hub, deposits, solver: SOLVER, musdWallet: async () => musd });
  return { sstore, sent, ops, chain, sweeps };
};

const user = privateKeyToAccount(generatePrivateKey());
let n = 0;
const sign = async (over: Partial<{ to: Address; value: bigint; validBefore: bigint; chainId: number }> = {}) => {
  const nonce = `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
  const message = { from: user.address, to: over.to ?? SOLVER, value: over.value ?? 1_053_204n, validAfter: 0n, validBefore: over.validBefore ?? BigInt(Math.floor(Date.now() / 1000) + 3600), nonce };
  const sig = await user.signTypedData({
    domain: { ...DOMAIN, chainId: over.chainId ?? BASE, verifyingContract: BASE_USDC as Address },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message,
  });
  return { owner: user.address, chainId: BASE, token: BASE_USDC, value: message.value.toString(), validAfter: "0", validBefore: message.validBefore.toString(), nonce, sig };
};

describe("usdc sweeps", () => {
  test("recovers the signer only under the token's own domain", async () => {
    const b = await sign();
    const a: Authorization = { from: user.address, to: SOLVER, value: BigInt(b.value), validAfter: 0n, validBefore: BigInt(b.validBefore), nonce: b.nonce, sig: b.sig };
    expect(await authorizationSigner(BASE, BASE_USDC as Address, DOMAIN, a)).toBe(user.address);
    expect(await authorizationSigner(BASE, BASE_USDC as Address, { name: "USDC", version: "2" }, a)).not.toBe(user.address);
    expect(await authorizationSigner(10, BASE_USDC as Address, DOMAIN, a)).not.toBe(user.address);
  });

  test("a signed authorization is submitted once, credits MUSD 1:1 and repeats are idempotent", async () => {
    const r = rig();
    r.chain.held.set(user.address.toLowerCase(), 1_053_204n);
    const b = await sign();
    const tx = await r.sweeps.accept(b);
    expect(tx).toMatchObject({ id: sweepId(BASE, b.nonce), kind: "bridge", status: "pending" });
    await until(() => r.ops.deposits.length === 1);
    expect(r.ops.deposits[0]).toEqual([1_053_204n * 10n ** 12n, user.address.toLowerCase()]);
    expect(r.chain.submits[0]).toMatchObject({ from: user.address, to: SOLVER, value: 1_053_204n });
    expect(await r.sweeps.accept(b)).toMatchObject({ id: tx.id, status: "confirmed" });
    expect(await r.sweeps.accept({ ...b, nonce: b.nonce.toUpperCase().replace("0X", "0x") })).toMatchObject({ id: tx.id });
    expect(r.chain.submits.length).toBe(1);
    expect(r.ops.deposits.length).toBe(1);
    const txs = r.sent.flatMap((m) => (m.type === "tx" ? [[m.topic, m.tx.kind, m.tx.status]] : []));
    expect(txs.at(-1)).toEqual([`user:${user.address.toLowerCase()}`, "bridge", "confirmed"]);
  });

  test("rejects a wrong recipient, too much value, expiry, used nonces and other chains", async () => {
    const r = rig();
    r.chain.held.set(user.address.toLowerCase(), 1_000_000n);
    await expect(r.sweeps.accept(await sign({ to: user.address, value: 1n }))).rejects.toMatchObject({ status: 400, code: "bad_signature" });
    await expect(r.sweeps.accept(await sign({ chainId: 10, value: 1n }))).rejects.toMatchObject({ status: 400, code: "bad_signature" });
    await expect(r.sweeps.accept(await sign({ value: 2_000_000n }))).rejects.toMatchObject({ status: 400, code: "insufficient_balance" });
    await expect(r.sweeps.accept(await sign({ value: 1n, validBefore: 10n }))).rejects.toMatchObject({ status: 400, code: "expired" });
    await expect(r.sweeps.accept({ ...(await sign({ value: 1n })), chainId: 42161 })).rejects.toMatchObject({ status: 400, code: "bad_chain" });
    const used = await sign({ value: 1n });
    r.chain.usedNonces.add(used.nonce);
    await expect(r.sweeps.accept(used)).rejects.toMatchObject({ status: 409, code: "authorization_used" });
    expect(r.chain.submits.length).toBe(0);
  });

  test("a solver without MUSD or gas answers 503 and never submits", async () => {
    const r = rig(WAD / 2n);
    r.chain.held.set(user.address.toLowerCase(), 1_053_204n);
    await expect(r.sweeps.accept(await sign())).rejects.toMatchObject({ status: 503, code: "solver_low_musd" });
    const failed = r.sent.find((m) => m.type === "tx");
    expect(failed?.type === "tx" && [failed.tx.status, failed.tx.error]).toEqual(["failed", "solver low on MUSD"]);
    const g = rig();
    g.chain.held.set(user.address.toLowerCase(), 1_053_204n);
    g.chain.gasWei = 0n;
    await expect(g.sweeps.accept(await sign())).rejects.toMatchObject({ status: 503, code: "solver_no_gas" });
    expect(r.chain.submits.length + g.chain.submits.length).toBe(0);
  });

  test("external balances list non-zero usdc per watched address and report changes", async () => {
    const chain = new FakeChain();
    const other = new FakeChain(42161);
    other.balances = async () => {
      throw new Error("rate limited");
    };
    const a = user.address.toLowerCase();
    const changed: string[] = [];
    const ext = new ExternalUsdc({ chains: [chain, other], watched: () => [a, "0x2222222222222222222222222222222222222222"], onChange: (x) => changed.push(x), everyMs: 0 });
    chain.held.set(a, 1_053_204n);
    await ext.poll();
    expect(ext.get(a)).toEqual([{ chainId: BASE, token: BASE_USDC as Address, amount: "1053204" }]);
    expect(ext.get("0x2222222222222222222222222222222222222222")).toEqual([]);
    expect(changed).toEqual([a]);
    await ext.poll();
    expect(changed).toEqual([a]);
    chain.held.set(a, 0n);
    await ext.poll();
    expect(ext.get(a)).toEqual([]);
    expect(changed).toEqual([a, a]);
  });
});

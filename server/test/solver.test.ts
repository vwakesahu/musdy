import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { Address, Hash } from "viem";
import { SOLANA, type ServerMsg, type TokenInfo } from "shared";
import { openDb } from "../src/db";
import { HttpError } from "../src/errors";
import { Hub } from "../src/hub";
import { PriceBook } from "../src/price-book";
import { WAD } from "../src/pricing";
import { BASE, BASE_USDC } from "../src/solver/config";
import { Deposits, minUsdOf } from "../src/solver/deposits";
import { LiveRunner, parseSolanaKey } from "../src/solver/exec";
import type { MezoOps } from "../src/solver/mezo";
import { amountOut, RelayError, RelayHttp, type Quote, type RelayRequest } from "../src/solver/relay";
import { Solver, type IntentEvent } from "../src/solver/solver";
import { SolverStore, xKey } from "../src/solver/store";
import { Store } from "../src/store";
import { Views } from "../src/views";
import { tempDb } from "./helpers/anvil";
import { BONK, FakeRelay, FakeRunner, filled, fixture, SOLVER_SOL } from "./helpers/relay";

const SOLVER = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
const USER = "0x1111111111111111111111111111111111111111" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(5);
  }
};

class FakeOps {
  address = SOLVER as Address;
  settles: [string, string, bigint, bigint, boolean][] = [];
  deposits: [bigint, string][] = [];
  async feeBps() {
    return 50;
  }
  async settled() {
    return false;
  }
  async settle(id: Hash, user: Address, musd: bigint, tokens: bigint, ok: boolean) {
    this.settles.push([id, user, musd, tokens, ok]);
    return { hash: "0xabc" as Hash, ok: true, error: null };
  }
  async deposit(amount: bigint, user: Address, onSent?: (h: Hash) => void) {
    this.deposits.push([amount, user]);
    onSent?.("0xdef");
    return { hash: "0xdef" as Hash, ok: true, error: null };
  }
}

const rig = () => {
  const store = new Store(openDb(tempDb()));
  const book = new PriceBook(store);
  const views = new Views(store, book, "0x00000000000000000000000000000000000000bb", 1n, () => 1, 31337);
  const sent: ServerMsg[] = [];
  const hub = new Hub({ welcome: () => ({ type: "welcome", serverTime: 0, block: 0, chainId: 31337 }), replay: () => null });
  hub.publish = (topic, make) => void sent.push(make(topic));
  const relay = new FakeRelay();
  const runner = new FakeRunner(SOLVER);
  const ops = new FakeOps();
  const sstore = new SolverStore(store);
  const solver = new Solver({ relay, runner, ops: ops as unknown as MezoOps, store: sstore, views, book, hub, pollMs: 1, waitingMs: 50 });
  return { store, views, relay, runner, ops, sstore, solver, sent };
};

let seq = 0;
const opened = (isBuy: boolean, amountIn: bigint, minOut = 0n, token = BONK, chainId = SOLANA): IntentEvent => {
  seq++;
  return {
    kind: "opened",
    id: `0x${seq.toString(16).padStart(64, "0")}` as Hash,
    user: USER,
    txHash: `0x${(1000 + seq).toString(16).padStart(64, "0")}` as Hash,
    block: seq,
    logIndex: 0,
    ts: Math.floor(Date.now() / 1000),
    isBuy,
    chainId,
    token,
    amountIn,
    minOut,
    ref: ZERO,
  };
};
const settledEv = (o: IntentEvent, musdToUser: bigint, tokenAmount: bigint, ok: boolean): IntentEvent => ({
  ...o,
  kind: "settled",
  txHash: `0x${(5000 + seq).toString(16).padStart(64, "0")}` as Hash,
  block: o.block + 1,
  logIndex: 3,
  musdToUser,
  tokenAmount,
  ok,
});

describe("relay client and recorded responses", () => {
  test("amountOut reads what reached the recipient in v2 and v3 request shapes", () => {
    const v2 = fixture<{ requests: RelayRequest[] }>("requests-v2-deposit").requests[0]!;
    expect(amountOut(v2, "0xc1d5041826d883895e1787543336f7d7bc8cce93", "0x00000000000000000000000000000000")).toBe(10524116900n);
    expect(amountOut(v2, "0xf70da97812cb96acdf810712aa562db8dfa3dbef", "0x00000000000000000000000000000000")).toBe(null);
    const v3 = fixture<{ requests: RelayRequest[] }>("requests-v3-deposit").requests[0]!;
    expect(amountOut(v3, "0xC1D5041826d883895E1787543336f7d7BC8CCe93", "0x00000000000000000000000000000000")).toBe(11629322800n);
    expect(amountOut(filled("0x1", SOLVER_SOL, BONK, 7n, SOLANA), SOLVER_SOL, BONK)).toBe(7n);
    expect(amountOut(filled("0x1", SOLVER_SOL, BONK, 7n, SOLANA), SOLVER_SOL, BONK.toLowerCase())).toBe(null);
  });

  test("uses requests v3 with a key, v2 without, retries 429 and maps errors", async () => {
    const calls: { url: string; key: string | null }[] = [];
    let busy = 1;
    const fake = (async (url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)["x-api-key"] ?? null;
      calls.push({ url, key });
      if (url.includes("/quote/v2") && busy-- > 0) return new Response("{}", { status: 429 });
      if (url.includes("/quote/v2") && JSON.parse(String(init?.body)).originChainId === SOLANA) return Response.json(fixture("quote-deposit-solana-nokey"), { status: 401 });
      if (url.includes("/quote/v2")) return Response.json(fixture("quote-deposit-arbitrum"));
      return Response.json(fixture("requests-v2-deposit"));
    }) as typeof fetch;
    const free = new RelayHttp("https://relay.test", undefined, fake);
    const q = await free.quote({ user: USER, recipient: SOLVER, originChainId: 42161, originCurrency: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", destinationChainId: BASE, destinationCurrency: BASE_USDC, amount: "10000000", tradeType: "EXACT_INPUT", useDepositAddress: true, refundTo: ZERO });
    expect(q.steps[0]!.depositAddress).toBe("0xa6fce2eb8084fd69704e75df8d2af172b13ec459");
    expect(minUsdOf(q)).toBe(1);
    expect((await free.byDepositAddress("0xabc")).length).toBe(4);
    const keyed = new RelayHttp("https://relay.test", "k1", fake);
    await keyed.request("0x99");
    expect(calls.filter((c) => c.url.includes("/requests/")).map((c) => [c.url.split("?")[0], c.key])).toEqual([
      ["https://relay.test/requests/v2", null],
      ["https://relay.test/requests/v3", "k1"],
    ]);
    const err = await free.quote({ user: USER, recipient: SOLVER, originChainId: SOLANA, originCurrency: "x", destinationChainId: BASE, destinationCurrency: BASE_USDC, amount: "1", tradeType: "EXACT_INPUT" }).catch((e: unknown) => e);
    expect(err instanceof RelayError && [err.status, err.code]).toEqual([401, "UNAUTHORIZED"]);
  });

  test("the live runner only sends transactions and reads solana keys in both formats", async () => {
    const kp = Keypair.generate();
    expect(parseSolanaKey(bs58.encode(kp.secretKey)).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    expect(parseSolanaKey(JSON.stringify(Array.from(kp.secretKey))).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    const runner = new LiveRunner({ key: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", rpc: {} });
    expect(runner.evmAddress).toBe(SOLVER);
    expect(runner.solanaAddress).toBe(null);
    const sig: Quote = { steps: [{ id: "authorize1", kind: "signature", items: [{ status: "incomplete", data: {} }] }], details: fixture<Quote>("quote-buy-base").details };
    await expect(runner.run(sig)).rejects.toThrow("needs a signature");
    await expect(runner.run(fixture<Quote>("quote-sell-solana"))).rejects.toThrow("SOLVER_SOLANA_KEY");
  });
});

describe("solver intents", () => {
  test("a buy quotes base USDC to the coin, runs the steps and settles the tokens received", async () => {
    const r = rig();
    await r.solver.start();
    r.relay.requestFor = (id) => filled(id, SOLVER_SOL, BONK, 160_000_000_000n, SOLANA);
    const o = opened(true, 10n * WAD);
    r.solver.onEvent(o);
    await until(() => r.ops.settles.length === 1);
    expect(r.relay.quotes[0]).toMatchObject({ user: SOLVER, recipient: SOLVER_SOL, originChainId: BASE, originCurrency: BASE_USDC, destinationChainId: SOLANA, destinationCurrency: BONK, amount: "10000000", tradeType: "EXACT_INPUT" });
    expect(r.runner.runs.length).toBe(1);
    expect(r.ops.settles[0]).toEqual([o.id, USER, 0n, 160_000_000_000n, true]);

    r.solver.onEvent(settledEv(o, 0n, 160_000_000_000n, true));
    const feed = r.views.feed(r.store.userTrades(USER));
    expect(feed.length).toBe(1);
    expect(feed[0]).toMatchObject({ venue: "relay", isBuy: true, musdAmount: (10n * WAD).toString(), tokenAmount: "160000000000" });
    expect(feed[0]!.token).toMatchObject({ chainId: SOLANA, address: BONK, symbol: "BONK", decimals: 5 });
    const pos = r.views.positions(USER);
    expect(pos.map((p) => [p.token.address, p.amount, p.costMusd, p.withdrawable])).toEqual([[BONK, "160000000000", (10n * WAD).toString(), false]]);
    expect(r.views.profile(USER, 0n).totalValueMusd).toBe((10n * WAD).toString());
    const tx = r.sent.find((m) => m.type === "tx");
    expect(tx?.type === "tx" && [tx.tx.id, tx.tx.kind, tx.tx.status]).toEqual([o.id, "intent", "confirmed"]);
    const trade = r.sent.find((m) => m.type === "trade");
    expect(trade?.type === "trade" && [trade.topic, trade.item.venue, trade.item.token.chainId]).toEqual(["feed:global", "relay", SOLANA]);
    r.solver.stop();
  });

  test("a relay trade's feed item carries the market's casing and its market cap at trade time", async () => {
    const r = rig();
    await r.solver.start();
    let mcap = "1500000000000000000000000000";
    r.views.marketCoin = (ref) => (ref.chainId === SOLANA && ref.address === BONK ? ({ symbol: "Bonk", name: "Bonk Inu", image: "https://dex/bonk.png", marketCapMusd: mcap } as TokenInfo) : null);
    r.relay.requestFor = (id) => filled(id, SOLVER_SOL, BONK, 160_000_000_000n, SOLANA);
    const o = opened(true, 10n * WAD);
    r.solver.onEvent(o);
    await until(() => r.ops.settles.length === 1);
    r.store.db.query("UPDATE tokens SET symbol = 'bonk', name = 'bonk' WHERE address = ?").run(xKey(SOLANA, BONK));
    r.solver.onEvent(settledEv(o, 0n, 160_000_000_000n, true));
    mcap = "9";
    const item = r.views.feed(r.store.userTrades(USER))[0]!;
    expect(item.marketCapMusd).toBe("1500000000000000000000000000");
    expect(item.token).toMatchObject({ symbol: "Bonk", name: "Bonk Inu", image: "https://dex/bonk.png" });
    r.views.marketCoin = null;
    expect(r.views.feed(r.store.userTrades(USER))[0]!.token).toMatchObject({ symbol: "Bonk", name: "Bonk Inu" });
    expect(r.views.feed(r.store.userTrades(USER))[0]!.marketCapMusd).toBe("1500000000000000000000000000");
    r.solver.stop();
  });

  test("a buy relay refunds is settled not ok with the MUSD back, and a bad minOut never runs steps", async () => {
    const r = rig();
    await r.solver.start();
    r.relay.statusFor = () => ({ status: "refund", failReason: "SLIPPAGE" });
    const o = opened(true, 5n * WAD);
    r.solver.onEvent(o);
    await until(() => r.ops.settles.length === 1);
    expect(r.ops.settles[0]).toEqual([o.id, USER, 5n * WAD, 0n, false]);
    r.solver.onEvent(settledEv(o, 5n * WAD, 0n, false));
    expect(r.sstore.intent(o.id)).toMatchObject({ status: "refunded", error: "relay refunded the swap: SLIPPAGE" });
    expect(r.store.userTrades(USER).length).toBe(0);

    const greedy = opened(true, 5n * WAD, 10n ** 30n);
    r.solver.onEvent(greedy);
    await until(() => r.ops.settles.length === 2);
    expect(r.ops.settles[1]).toEqual([greedy.id, USER, 5n * WAD, 0n, false]);
    expect(r.runner.runs.length).toBe(1);
    r.solver.stop();
  });

  test("a sell needs the ledger position and settles USDC as MUSD minus the fee", async () => {
    const r = rig();
    await r.solver.start();
    expect(() => r.solver.check({ user: USER, isBuy: false, chainId: SOLANA, token: BONK, amountIn: 1n })).toThrow(HttpError);
    expect(() => r.solver.check({ user: USER, isBuy: true, chainId: 1, token: BONK, amountIn: WAD })).toThrow("not a coin address");
    r.relay.requestFor = (id) => filled(id, SOLVER_SOL, BONK, 1000n, SOLANA);
    const buy = opened(true, 10n * WAD);
    r.solver.onEvent(buy);
    await until(() => r.ops.settles.length === 1);
    r.solver.onEvent(settledEv(buy, 0n, 1000n, true));

    r.solver.check({ user: USER, isBuy: false, chainId: SOLANA, token: BONK, amountIn: 600n });
    r.relay.quoteFor = () => fixture("quote-sell-solana");
    r.relay.requestFor = (id) => filled(id, SOLVER, BASE_USDC.toLowerCase(), 4_000_000n, BASE);
    const sell = opened(false, 600n);
    r.solver.onEvent(sell);
    expect(() => r.solver.check({ user: USER, isBuy: false, chainId: SOLANA, token: BONK, amountIn: 600n })).toThrow("hold less");
    await until(() => r.ops.settles.length === 2);
    expect(r.relay.quotes[1]).toMatchObject({ user: SOLVER_SOL, recipient: SOLVER, originChainId: SOLANA, originCurrency: BONK, destinationChainId: BASE, destinationCurrency: BASE_USDC, amount: "600" });
    const gross = 4n * WAD;
    const net = gross - (gross * 50n) / 10_000n;
    expect(r.ops.settles[1]).toEqual([sell.id, USER, net, 600n, true]);
    r.solver.onEvent(settledEv(sell, net, 600n, true));
    const feed = r.views.feed(r.store.userTrades(USER));
    expect(feed.map((f) => [f.isBuy, f.musdAmount, f.tokenAmount])).toEqual([
      [false, net.toString(), "600"],
      [true, (10n * WAD).toString(), "1000"],
    ]);
    expect(r.store.position(USER, `${SOLANA}:${BONK}`.toLowerCase())?.amount).toBe(400n);
    r.solver.stop();
  });

  test("restarting resumes an intent that was waiting on relay", async () => {
    const r = rig();
    const o = opened(true, 2n * WAD);
    r.sstore.openIntent({ id: o.id, user: USER, isBuy: true, chainId: SOLANA, token: BONK, amountIn: 2n * WAD, minOut: 0n, ref: ZERO, at: o.ts });
    r.sstore.update(o.id, { status: "filling", request_id: "0xreq" });
    r.relay.requestFor = (id) => (id === "0xreq" ? filled(id, SOLVER_SOL, BONK, 55n, SOLANA) : null);
    await r.solver.start();
    await until(() => r.ops.settles.length === 1);
    expect(r.runner.runs.length).toBe(0);
    expect(r.ops.settles[0]).toEqual([o.id, USER, 0n, 55n, true]);
    r.solver.stop();
  });
});

describe("deposit addresses", () => {
  const deps = (ops: FakeOps | null) => {
    const r = rig();
    const dep = new Deposits({ relay: r.relay, store: r.sstore, hub: (r.solver as unknown as { d: { hub: Hub } }).d.hub, ops: ops as unknown as MezoOps });
    return { ...r, dep };
  };

  test("chains carry relay icons, an address is made once per user and chain", async () => {
    const r = deps(new FakeOps());
    r.relay.quoteFor = () => fixture("quote-deposit-arbitrum");
    expect(r.dep.chains().map((c) => c.chainId)).toEqual([SOLANA, BASE, 56, 1, 42161]);
    const a = await r.dep.address(USER, 42161);
    expect(a).toMatchObject({ chainId: 42161, name: "Arbitrum", currency: "USDC", address: "0xa6fce2eb8084fd69704e75df8d2af172b13ec459", minUsd: 1 });
    expect(a.icon).toBe("https://assets.relay.link/icons/42161/light.png");
    expect(r.relay.quotes[0]).toMatchObject({ user: USER, recipient: SOLVER, originChainId: 42161, destinationChainId: BASE, destinationCurrency: BASE_USDC, useDepositAddress: true, refundTo: ZERO });
    expect((await r.dep.address(USER, 42161)).address).toBe(a.address);
    expect(r.relay.quotes.length).toBe(1);
    await expect(r.dep.address(USER, SOLANA)).rejects.toMatchObject({ status: 503, code: "relay_key_missing" });
    await expect(r.dep.address(USER, 10)).rejects.toMatchObject({ status: 400 });
    await expect(deps(null).dep.address(USER, 42161)).rejects.toMatchObject({ status: 503, code: "solver_off" });
    r.relay.hasKey = true;
    await r.dep.address(USER, SOLANA);
    expect(r.relay.quotes[1]).toMatchObject({ originChainId: SOLANA, originCurrency: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", refundTo: "11111111111111111111111111111111" });
  });

  test("a relay fill credits MUSD 1:1 once and pushes bridge txs", async () => {
    const ops = new FakeOps();
    const r = deps(ops);
    r.relay.quoteFor = () => fixture("quote-deposit-base");
    const a = await r.dep.address(USER, BASE);
    r.relay.byAddress.set(a.address, [filled("0xfill", SOLVER, BASE_USDC, 12_340_000n, BASE), { ...filled("0xback", SOLVER, BASE_USDC, 1n, BASE), status: "refund" }, { ...filled("0xwait", SOLVER, BASE_USDC, 1n, BASE), status: "pending" }]);
    await r.dep.tick();
    await r.dep.tick();
    expect(ops.deposits).toEqual([[12_340_000n * 10n ** 12n, USER.toLowerCase()]]);
    const txs = r.sent.flatMap((m) => (m.type === "tx" ? [[m.tx.id, m.tx.kind, m.tx.status]] : []));
    expect(txs).toEqual([
      ["0xfill", "bridge", "pending"],
      ["0xback", "bridge", "failed"],
      ["0xfill", "bridge", "pending"],
      ["0xfill", "bridge", "confirmed"],
    ]);
  });
});

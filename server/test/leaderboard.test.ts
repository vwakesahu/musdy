import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { LeaderRow } from "shared";
import { openDb } from "../src/db";
import { PriceBook } from "../src/price-book";
import { WAD } from "../src/pricing";
import { Store, type TradeRow } from "../src/store";
import { Views } from "../src/views";
import { CONTRACTS_READY, SKIP_NOTE, startStack, tempDb, type Stack } from "./helpers/anvil";
import { Actor, get } from "./helpers/actors";

const TOKEN = "0x00000000000000000000000000000000000000aa";
const WINNER = "0x1111111111111111111111111111111111111111";
const LOSER = "0x2222222222222222222222222222222222222222";
const OLD = "0x3333333333333333333333333333333333333333";
const now = Math.floor(Date.now() / 1000);
let n = 0;
const trade = (user: string, isBuy: boolean, musd: bigint, tokens: bigint, ts: number): TradeRow => {
  n++;
  return {
    id: `0x${n.toString(16).padStart(64, "0")}:0`,
    block: n,
    log_index: 0,
    ts,
    tx_hash: `0x${n.toString(16).padStart(64, "0")}`,
    user,
    token: TOKEN,
    is_buy: isBuy ? 1 : 0,
    musd_amount: musd.toString(),
    token_amount: tokens.toString(),
    fee: "0",
    ref: null,
    venue: "pool",
    price: ((musd * WAD) / tokens).toString(),
    price_f: 0,
    musd_f: 0,
  };
};

describe("leaderboard ranking", () => {
  test("ranks by pnl per window from the real store and price history", () => {
    const store = new Store(openDb(tempDb()));
    store.seedToken({ address: TOKEN, symbol: "TKN", name: "Token", decimals: 18, kind: "stock", createdAt: 0 });
    const book = new PriceBook(store);
    store.insertTrade(trade(OLD, true, 10n * WAD, 10n * WAD, now - 10 * 86400));
    store.insertTrade(trade(OLD, false, 30n * WAD, 10n * WAD, now - 9 * 86400));
    book.record(TOKEN, now - 10 * 86400, 1, WAD);
    book.record(TOKEN, now - 9 * 86400, 2, 3n * WAD);
    store.insertTrade(trade(WINNER, true, 20n * WAD, 10n * WAD, now - 3600));
    store.insertTrade(trade(LOSER, true, 20n * WAD, 10n * WAD, now - 3600));
    store.insertTrade(trade(LOSER, false, 15n * WAD, 10n * WAD, now - 1800));
    book.record(TOKEN, now - 3600, 3, 2n * WAD);
    book.record(TOKEN, now - 60, 4, (5n * WAD) / 2n);
    const views = new Views(store, book, "0x00000000000000000000000000000000000000bb", 1n, () => 4);

    const d1 = views.leaderboard("d1");
    expect(d1.map((r) => [r.rank, r.user.address.toLowerCase(), r.pnlMusd])).toEqual([
      [1, WINNER, (5n * WAD).toString()],
      [2, LOSER, (-5n * WAD).toString()],
    ]);
    expect(d1[0]!.pnlPct).toBeCloseTo(0.25);
    expect(d1[1]!.volumeMusd).toBe((35n * WAD).toString());
    expect(d1[1]!.trades).toBe(2);

    const all = views.leaderboard("all");
    expect(all.map((r) => r.user.address.toLowerCase())).toEqual([OLD, WINNER, LOSER]);
    expect(all[0]!.pnlMusd).toBe((20n * WAD).toString());
  });
});

describe("positions table", () => {
  test("kept incrementally it matches a full recompute after buys, partial fills, sells and transfers", () => {
    const store = new Store(openDb(tempDb()));
    store.seedToken({ address: TOKEN, symbol: "TKN", name: "Token", decimals: 18, kind: "stock", createdAt: 0 });
    const book = new PriceBook(store);
    book.record(TOKEN, now - 7200, 1, 2n * WAD);
    const views = new Views(store, book, "0x00000000000000000000000000000000000000bb", 1n, () => 100);
    const A = "0x4444444444444444444444444444444444444444";
    const B = "0x5555555555555555555555555555555555555555";
    let log = 0;
    const transfer = (user: string, kind: "deposit" | "withdraw", amount: bigint, ts: number) => {
      n++;
      store.tx(() => {
        store.insertTransfer({ id: `0x${n.toString(16).padStart(64, "0")}:${log++}`, block: n, log_index: 0, ts, kind, user, token: TOKEN, amount: amount.toString(), to_addr: null });
        store.applyFlow(user, TOKEN, { kind: kind === "deposit" ? "in" : "out", amount, musd: kind === "deposit" ? views.value(TOKEN, amount, ts) : 0n });
      });
    };
    store.insertTrade(trade(A, true, 20n * WAD, 10n * WAD, now - 7000));
    store.insertTrade(trade(A, true, 7n * WAD, 3n * WAD, now - 6000));
    store.insertTrade(trade(B, true, 9n * WAD, 4n * WAD, now - 5500));
    store.insertTrade(trade(A, false, 9n * WAD, 4n * WAD, now - 5000));
    transfer(A, "deposit", 5n * WAD, now - 4000);
    transfer(A, "withdraw", 2n * WAD, now - 3000);
    store.insertTrade(trade(B, false, 11n * WAD, 4n * WAD, now - 2000));
    store.insertTrade(trade(A, false, 30n * WAD, 100n * WAD, now - 1000));
    store.insertTrade(trade(B, true, 3n * WAD, WAD, now - 500));

    const key = (p: { user: string; token: string }) => `${p.user}:${p.token}`;
    const sort = <T extends { user: string; token: string }>(xs: T[]) => [...xs].sort((x, y) => key(x).localeCompare(key(y)));
    const incremental = sort(store.allPositions());
    expect(incremental).toEqual(sort(views.recomputePositions()));
    expect(incremental.map((p) => [p.user, p.amount, p.trades])).toEqual([
      [A, 0n, 4],
      [B, WAD, 3],
    ]);
    expect(views.holderCount(TOKEN)).toBe(1);
  });
});

describe.skipIf(!CONTRACTS_READY)(`leaderboard against anvil${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("an early buyer outranks a late buyer after the price runs", async () => {
    const btc = s.dep.btc;
    const [early, late] = await Promise.all([Actor.create(s), Actor.create(s)]);
    await Promise.all([early.faucet(), late.faucet()]);
    await early.trade(btc, true, 500n * WAD);
    await late.trade(btc, true, 900n * WAD);
    for (const w of ["d1", "d7", "all"]) {
      const rows = (await get<LeaderRow[]>(s.app.url, `/leaderboard?window=${w}`)).body;
      expect(rows.map((r) => r.user.address)).toEqual([early.address, late.address]);
      expect(BigInt(rows[0]!.pnlMusd) > BigInt(rows[1]!.pnlMusd)).toBe(true);
    }
    expect((await get<{ code: string }>(s.app.url, "/leaderboard?window=year")).body.code).toBe("bad_param");
  }, 60000);
});

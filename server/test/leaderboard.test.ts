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
    // OLD bought 10 days ago at 1 and sold 9 days ago at 3: +20 all time, nothing in d1 or d7
    store.insertTrade(trade(OLD, true, 10n * WAD, 10n * WAD, now - 10 * 86400));
    store.insertTrade(trade(OLD, false, 30n * WAD, 10n * WAD, now - 9 * 86400));
    book.record(TOKEN, now - 10 * 86400, 1, WAD);
    book.record(TOKEN, now - 9 * 86400, 2, 3n * WAD);
    // today both buy 10 at 2, the price ends at 2.5
    store.insertTrade(trade(WINNER, true, 20n * WAD, 10n * WAD, now - 3600));
    store.insertTrade(trade(LOSER, true, 20n * WAD, 10n * WAD, now - 3600));
    // the loser dumps at 1.5
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

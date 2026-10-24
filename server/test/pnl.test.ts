import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Position, Profile } from "shared";
import { pnlAt, pnlWindow, replay, type Flow } from "../src/pnl";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, get } from "./helpers/actors";

const T = "0xtoken";
const DAY = 86400;
const flat = (prices: Record<number, bigint>) => (_t: string, amount: bigint, ts: number) => {
  const keys = Object.keys(prices).map(Number).sort((a, b) => a - b);
  let p = prices[keys[0]!]!;
  for (const k of keys) if (k <= ts) p = prices[k]!;
  return (amount * p) / WAD;
};

describe("average cost pnl", () => {
  test("buys average the cost, sells realize against it", () => {
    const flows: Flow[] = [
      { ts: 1, token: T, kind: "buy", amount: 10n * WAD, musd: 100n * WAD },
      { ts: 2, token: T, kind: "buy", amount: 10n * WAD, musd: 300n * WAD },
      { ts: 3, token: T, kind: "sell", amount: 5n * WAD, musd: 150n * WAD },
    ];
    const h = replay(flows).get(T)!;
    expect(h.amount).toBe(15n * WAD);
    expect(h.cost).toBe(300n * WAD);
    expect(h.realized).toBe(50n * WAD);
    expect(pnlAt(flows, 10, flat({ 0: 25n * WAD }))).toBe(125n * WAD);
  });

  test("withdrawing tokens removes cost without realizing, deposits enter at market value", () => {
    const flows: Flow[] = [
      { ts: 1, token: T, kind: "in", amount: 4n * WAD, musd: 40n * WAD },
      { ts: 2, token: T, kind: "out", amount: 2n * WAD, musd: 0n },
    ];
    const h = replay(flows).get(T)!;
    expect(h).toEqual({ amount: 2n * WAD, cost: 20n * WAD, realized: 0n });
    expect(pnlAt(flows, 3, flat({ 0: 10n * WAD }))).toBe(0n);
  });

  test("selling more than was tracked never goes negative", () => {
    const h = replay([{ ts: 1, token: T, kind: "sell", amount: WAD, musd: 5n * WAD }]).get(T)!;
    expect(h.amount).toBe(0n);
    expect(h.realized).toBe(5n * WAD);
  });

  test("windows subtract the pnl at the window start", () => {
    const now = 10 * DAY;
    const flows: Flow[] = [{ ts: 1, token: T, kind: "buy", amount: 10n * WAD, musd: 100n * WAD }];
    const value = flat({ 0: 10n * WAD, [2 * DAY]: 12n * WAD, [now - 3600]: 15n * WAD });
    expect(pnlWindow(flows, now, "all", value)).toBe(50n * WAD);
    expect(pnlWindow(flows, now, "d7", value)).toBe(30n * WAD);
    expect(pnlWindow(flows, now, "d1", value)).toBe(30n * WAD);
    expect(pnlWindow(flows, now + 2 * DAY, "d1", value)).toBe(0n);
  });
});

describe.skipIf(!CONTRACTS_READY)(`pnl against anvil${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("a position shows cost, value and pnl, and moves with the price", async () => {
    const nvda = s.dep.tokens.find((t) => t.symbol === "NVDA")!.address;
    const a = await Actor.create(s);
    const b = await Actor.create(s);
    await Promise.all([a.faucet(), b.faucet()]);
    await a.trade(nvda, true, 100n * WAD);
    let p = (await get<Profile>(s.app.url, `/users/${a.address}`)).body;
    const pos = p.positions.find((x: Position) => x.token.address === nvda)!;
    expect(pos.costMusd).toBe((100n * WAD).toString());
    expect(BigInt(pos.amount)).toBe(await a.vaultBalance(nvda));
    expect(BigInt(pos.pnlMusd) < 0n).toBe(true);
    expect(BigInt(p.balanceMusd)).toBe(900n * WAD);

    await b.trade(nvda, true, 900n * WAD);
    p = (await get<Profile>(s.app.url, `/users/${a.address}`)).body;
    const after = p.positions.find((x: Position) => x.token.address === nvda)!;
    expect(BigInt(after.pnlMusd) > BigInt(pos.pnlMusd)).toBe(true);
    expect(BigInt(after.valueMusd) > BigInt(pos.valueMusd)).toBe(true);
    expect(after.withdrawable).toBe(true);
    expect(BigInt(p.pnl.all)).toBe(BigInt(after.pnlMusd));
    expect(BigInt(p.pnl.d1)).toBe(BigInt(after.pnlMusd));

    await a.trade(nvda, false, await a.vaultBalance(nvda));
    p = (await get<Profile>(s.app.url, `/users/${a.address}`)).body;
    expect(p.positions.find((x: Position) => x.token.address === nvda)).toBeUndefined();
    expect(BigInt(p.pnl.all)).toBe((await a.vaultBalance(s.dep.musd)) - 1000n * WAD);
    expect(p.trades).toBe(2);
  }, 60000);
});

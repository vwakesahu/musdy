import { expect, test } from "bun:test";
import { buildCandles } from "../src/candles";
import { curvePrice, poolPrice, tradePrice, valueOf, WAD } from "../src/pricing";

test("candles bucket ticks into ohlcv per timeframe", () => {
  const ticks = [
    { ts: 120, price: 1, volume: 10 },
    { ts: 130, price: 3, volume: 5 },
    { ts: 170, price: 2, volume: 1 },
    { ts: 185, price: 4, volume: 2 },
    { ts: 400, price: 5, volume: 7 },
  ];
  expect(buildCandles(ticks, "1m")).toEqual([
    { t: 120, o: 1, h: 3, l: 1, c: 2, v: 16 },
    { t: 180, o: 4, h: 4, l: 4, c: 4, v: 2 },
    { t: 360, o: 5, h: 5, l: 5, c: 5, v: 7 },
  ]);
  expect(buildCandles(ticks, "5m")).toEqual([
    { t: 0, o: 1, h: 4, l: 1, c: 4, v: 18 },
    { t: 300, o: 5, h: 5, l: 5, c: 5, v: 7 },
  ]);
  expect(buildCandles(ticks, "1d")).toHaveLength(1);
  expect(buildCandles([], "1h")).toEqual([]);
});

test("pool price is MUSD per whole token whichever side the token sits", () => {
  const token = "0x00000000000000000000000000000000000000aa";
  const musd = "0x00000000000000000000000000000000000000bb";
  // 100 tokens against 15,100 MUSD is 151 MUSD each
  expect(poolPrice(token, token, 100n * WAD, 15_100n * WAD, 18)).toBe(151n * WAD);
  expect(poolPrice(token, musd, 15_100n * WAD, 100n * WAD, 18)).toBe(151n * WAD);
  // a 6 decimals token
  expect(poolPrice(token, token, 100n * 10n ** 6n, 50n * WAD, 6)).toBe(WAD / 2n);
  expect(poolPrice(token, token, 0n, 1n, 18)).toBeNull();
});

test("curve price and trade price exclude the fee", () => {
  expect(curvePrice(1500n * WAD, 1_073_000_000n * WAD)).toBe((1500n * WAD * WAD) / (1_073_000_000n * WAD));
  // buy 100 MUSD with 0.5 fee for 2 tokens is 49.75 each
  expect(tradePrice(true, 100n * WAD, WAD / 2n, 2n * WAD, 18)).toBe((9950n * WAD) / 200n);
  // sell 2 tokens netting 99.5 after 0.5 fee is 50 each
  expect(tradePrice(false, (995n * WAD) / 10n, WAD / 2n, 2n * WAD, 18)).toBe(50n * WAD);
  expect(valueOf(3n * WAD, 2n * WAD, 18)).toBe(6n * WAD);
});

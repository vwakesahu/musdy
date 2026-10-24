import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import { SOLANA, type TokenInfo } from "shared";
import { Market, type MemeMove } from "../src/market/market";
import {
  coinsFromPairs,
  geckoCandles,
  listable,
  mergeLists,
  metaFromGeckoTokens,
  refsFromGeckoPools,
  refsFromProfiles,
  toInfo,
  usdUnits,
  withMeta,
  type Meta,
} from "../src/market/map";

const fx = (name: string): unknown => require(`./fixtures/market/${name}.json`);
const REMUS = "CA8q2mkYWZnUNqYmf6pxyxAPZsmSe2EG9P7hHMW5pump";
const XDP = getAddress("0x07b3d902783c3c12b077508c3b5c00113d1291d0");
const NOW = 1792860000_000;

describe("market mapping", () => {
  test("pairs become one coin per token and junk is filtered", () => {
    const coins = coinsFromPairs(fx("dex-pairs-solana"));
    expect(coins.size).toBe(12);
    const listed = [...coins.values()].map((c) => withMeta(c, { decimals: 6, image: null })).filter((c) => listable(c));
    expect(listed.map((c) => c.symbol).sort()).toEqual(["GATO", "GDC", "MI", "PRIVACY", "REMUS", "TRUMP"]);
    expect([...coins.values()].every((c) => !listable(c))).toBe(true);
  });

  test("a token seen in several pools keeps its deepest pool and sums volume", () => {
    const [remus] = fx("dex-pairs-solana") as { pairAddress: string; liquidity: { usd: number }; volume: { h24: number } }[];
    const shallow = { ...remus!, pairAddress: "Shallow1111111111111111111111111111111111", liquidity: { usd: 10 }, volume: { h24: 1000 } };
    const coin = coinsFromPairs([shallow, remus])!.get(`${SOLANA}:${REMUS}`)!;
    expect(coin.pair).toBe(remus!.pairAddress);
    expect(coin.volume24h).toBe(remus!.volume.h24 + 1000);
  });

  test("a coin maps to a meme TokenInfo with its own chain and real usd figures", () => {
    const remus = toInfo(withMeta(coinsFromPairs(fx("dex-pairs-solana")).get(`${SOLANA}:${REMUS}`)!, { decimals: 6, image: null }));
    expect(remus).toMatchObject({ address: REMUS, chainId: SOLANA, symbol: "REMUS", kind: "meme", venue: "relay", decimals: 6, pool: null, creator: null });
    expect(remus.priceMusd).toBe("656900000000000");
    expect(remus.change24h).toBe(8.1);
    expect(remus.volume24hMusd).toBe("1681207100000000000000000");
    expect(remus.marketCapMusd).toBe("647716000000000000000000");
    expect(remus.image).toStartWith("https://cdn.dexscreener.com/");
    expect(remus.createdAt).toBe(1792797028);

    const xdp = toInfo(coinsFromPairs(fx("dex-pairs-base")).get(`8453:${XDP.toLowerCase()}`)!);
    expect(xdp.address).toBe(XDP);
    expect(xdp.chainId).toBe(8453);
    expect(xdp.pool).toBe("0x2dF380544B88AdB3ad0A94100dcC45fd705aAE2d");
  });

  test("profiles keep only solana, base and bsc, evm addresses checksummed", () => {
    const refs = refsFromProfiles([...(fx("boosts-top") as object[]), { chainId: "bsc", tokenAddress: XDP.toLowerCase() }, { chainId: "base", tokenAddress: "nope" }]);
    expect(refs.filter((r) => r.chainId === SOLANA)).toHaveLength(4);
    expect(refs.at(-1)).toEqual({ chainId: 56, address: XDP });
    expect(refsFromProfiles(null)).toEqual([]);
  });

  test("gecko pools and tokens give refs, decimals and images", () => {
    const meta = new Map<string, Meta>();
    const refs = refsFromGeckoPools(fx("gecko-trending-base"), "base", meta);
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual({ chainId: 8453, address: XDP });
    expect(meta.get(`8453:${XDP.toLowerCase()}`)).toEqual({ decimals: 18, image: expect.stringMatching(/^https:\/\//) });
    metaFromGeckoTokens(fx("gecko-tokens-solana"), "solana", meta);
    expect(meta.get(`${SOLANA}:${REMUS}`)?.decimals).toBe(6);
  });

  test("usd figures convert to 18 decimal MUSD units", () => {
    expect(usdUnits("1")).toBe("1000000000000000000");
    expect(usdUnits("0.0000000000000000019")).toBe("1");
    expect(usdUnits(1.5e-7)).toBe("150000000000");
    expect(usdUnits(-3)).toBe("0");
    expect(usdUnits("1.2e-7")).toBe("120000000000");
    expect(usdUnits("junk")).toBe("0");
    expect(usdUnits(undefined)).toBe("0");
  });

  test("gecko ohlcv comes back oldest first", () => {
    const c = geckoCandles(fx("gecko-ohlcv"));
    expect(c).toHaveLength(5);
    expect(c[0]!.t).toBe(1792857300);
    expect(c.every((x, i) => i === 0 || x.t > c[i - 1]!.t)).toBe(true);
    expect(geckoCandles({ data: {} })).toEqual([]);
  });
});

const info = (o: Partial<TokenInfo>): TokenInfo => ({
  address: "0x0000000000000000000000000000000000000001",
  chainId: 31337,
  symbol: "X",
  name: "X",
  image: "https://x/y.png",
  decimals: 18,
  kind: "launch",
  venue: "curve",
  creator: null,
  priceMusd: "1",
  change24h: 0,
  volume24hMusd: "0",
  marketCapMusd: "0",
  curveProgress: null,
  pool: null,
  holders: 0,
  createdAt: 0,
  ...o,
});

describe("token lists", () => {
  const e18 = 10n ** 18n;
  const btc = info({ symbol: "BTC", kind: "btc", volume24hMusd: "0" });
  const stock = info({ symbol: "NVDA", kind: "stock", volume24hMusd: (500n * e18).toString() });
  const junk = info({ symbol: "E2E", image: null, volume24hMusd: (5n * e18).toString(), createdAt: 900 });
  const real = info({ symbol: "MCAT", volume24hMusd: (2000n * e18).toString(), createdAt: 500 });
  const meme = info({ symbol: "REMUS", kind: "meme", venue: "relay", chainId: SOLANA, volume24hMusd: (1000n * e18).toString(), createdAt: 700 });

  test("trending pins btc, hides junk test launches and ranks the rest by volume", () => {
    expect(mergeLists("trending", [btc, stock, junk, real], [meme]).map((t) => t.symbol)).toEqual(["BTC", "MCAT", "REMUS", "NVDA"]);
  });

  test("new is newest first across mezo launches and memecoins, stocks stay mezo", () => {
    expect(mergeLists("new", [junk, real], [meme]).map((t) => t.symbol)).toEqual(["E2E", "REMUS", "MCAT"]);
    expect(mergeLists("stocks", [stock], [meme])).toEqual([stock]);
  });
});

describe("market service", () => {
  const fake = () => {
    const calls: string[] = [];
    const fetchJson = async (url: string): Promise<unknown> => {
      calls.push(url);
      if (url.includes("/token-boosts/top/")) return fx("boosts-top");
      if (url.includes("dexscreener.com/token-")) return [];
      if (url.includes("/networks/base/trending_pools")) return fx("gecko-trending-base");
      if (url.includes("_pools")) return { data: [] };
      if (url.includes("/tokens/v1/solana/")) return fx("dex-pairs-solana");
      if (url.includes("/tokens/v1/base/")) return fx("dex-pairs-base");
      if (url.includes("/tokens/v1/")) return [];
      if (url.includes("/networks/solana/tokens/multi/")) {
        const addrs = url.split("/multi/")[1]!.split(",");
        return { data: addrs.map((address) => ({ attributes: { address, decimals: 6, image_url: null } })) };
      }
      if (url.includes("/ohlcv/")) return fx("gecko-ohlcv");
      throw new Error(`unexpected ${url}`);
    };
    return { calls, fetchJson };
  };

  test("discovers listed coins, pushes all chains in one price frame, caches candles", async () => {
    const { calls, fetchJson } = fake();
    const batches: MemeMove[][] = [];
    const m = new Market({ fetchJson, now: () => NOW, geckoGapMs: 0, onPrices: (b) => batches.push(b) });
    await m.discover();
    expect(m.list("trending").map((t) => t.symbol)).toEqual(["XDP", "TRUMP", "REMUS"]);
    expect(m.list("new").map((t) => t.symbol)).toEqual(["TRUMP", "REMUS"]);
    expect(m.list("trending").every((t) => t.image)).toBe(true);

    await m.prices();
    expect(batches.map((b) => b.map((x) => x.chainId).sort())).toEqual([[8453, SOLANA, SOLANA].sort()]);
    expect(await m.prices()).toEqual([]);

    const ref = { chainId: SOLANA, address: REMUS };
    expect((await m.candles(ref, "5m"))!).toHaveLength(5);
    await m.candles(ref, "5m");
    expect(calls.filter((u) => u.includes("/ohlcv/"))).toHaveLength(1);
    expect(calls.find((u) => u.includes("/ohlcv/"))).toContain(`/networks/solana/pools/6JDiSPsWBwcSN8xBa4LNBzMZRikxksbxcto8J3ELR4cG/ohlcv/minute?aggregate=5`);

    const unknown = { chainId: 56, address: XDP };
    expect(await m.token(unknown)).toBeNull();
    expect(await m.token(unknown)).toBeNull();
    expect(calls.filter((u) => u.includes("/tokens/v1/bsc/"))).toHaveLength(1);
    expect(m.findEvm(XDP.toLowerCase())?.chainId).toBe(8453);
  });
});

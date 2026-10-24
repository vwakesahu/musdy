import { getAddress } from "viem";
import { SOLANA, tokenKey, type Candle, type CandleTf, type TokenInfo, type TokenSort } from "shared";

export const CHAINS = { solana: SOLANA, base: 8453, bsc: 56 } as const;
export type Slug = keyof typeof CHAINS;
export const isSlug = (s: unknown): s is Slug => typeof s === "string" && Object.hasOwn(CHAINS, s);
export const slugOf = (chainId: number): Slug | null => (Object.keys(CHAINS) as Slug[]).find((s) => CHAINS[s] === chainId) ?? null;

export const MIN_LIQUIDITY = 50_000;
export const MIN_VOLUME = 50_000;
export const MIN_VOLUME_NEW = 10_000;
export const NEW_WINDOW = 7 * 86400;
export const LIST_LIMIT = 100;
export const JUNK_LAUNCH_VOLUME = 100n * 10n ** 18n;
const MAJORS = new Set(["USDC", "USDT", "USD1", "DAI", "USDE", "FDUSD", "PYUSD", "EURC", "WETH", "ETH", "CBETH", "WSTETH", "WBNB", "BNB", "SOL", "WSOL", "JITOSOL", "MSOL", "WBTC", "CBBTC", "BTCB"]);

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
export const isBase58 = (a: string) => BASE58.test(a);
export const isEvm = (a: string) => EVM.test(a);

export const normAddress = (chainId: number, a: string): string | null => {
  if (chainId === SOLANA) return isBase58(a) ? a : null;
  return isEvm(a) ? getAddress(a) : null;
};

export interface Ref {
  chainId: number;
  address: string;
}

export interface Meta {
  decimals: number;
  image: string | null;
}

export interface Coin extends Ref {
  symbol: string;
  name: string;
  image: string | null;
  decimals: number | null;
  priceUsd: string;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  pair: string;
  createdAt: number;
}

export interface DsPair {
  chainId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

export interface DsProfile {
  chainId?: string;
  tokenAddress?: string;
}

interface GtToken {
  id?: string;
  attributes?: { address?: string; decimals?: number | null; image_url?: string | null };
}
interface GtPools {
  data?: { attributes?: { pool_created_at?: string }; relationships?: { base_token?: { data?: { id?: string } } } }[];
  included?: GtToken[];
}

export const keyOf = (r: Ref) => tokenKey(r);

const realImage = (u: string | null | undefined): string | null => (u && /^https?:\/\//.test(u) && !u.includes("missing") ? u : null);

export const refsFromProfiles = (list: unknown): Ref[] => {
  if (!Array.isArray(list)) return [];
  const out: Ref[] = [];
  for (const p of list as DsProfile[]) {
    if (!isSlug(p.chainId) || !p.tokenAddress) continue;
    const chainId = CHAINS[p.chainId];
    const address = normAddress(chainId, p.tokenAddress);
    if (address) out.push({ chainId, address });
  }
  return out;
};

const gtMeta = (tokens: GtToken[] | undefined, chainId: number, into: Map<string, Meta>) => {
  for (const t of tokens ?? []) {
    const a = t.attributes;
    const address = a?.address ? normAddress(chainId, a.address) : null;
    if (!address || typeof a?.decimals !== "number") continue;
    into.set(keyOf({ chainId, address }), { decimals: a.decimals, image: realImage(a.image_url) });
  }
};

export const refsFromGeckoPools = (json: unknown, slug: Slug, meta: Map<string, Meta>): Ref[] => {
  const body = json as GtPools | null;
  const chainId = CHAINS[slug];
  gtMeta(body?.included, chainId, meta);
  const out: Ref[] = [];
  for (const p of body?.data ?? []) {
    const id = p.relationships?.base_token?.data?.id;
    const raw = id?.startsWith(`${slug}_`) ? id.slice(slug.length + 1) : null;
    const address = raw ? normAddress(chainId, raw) : null;
    if (address) out.push({ chainId, address });
  }
  return out;
};

export const metaFromGeckoTokens = (json: unknown, slug: Slug, meta: Map<string, Meta>) => {
  const data = (json as { data?: GtToken[] } | null)?.data;
  gtMeta(Array.isArray(data) ? data : [], CHAINS[slug], meta);
};

// one coin per token: price and pair from its deepest pool, volume summed over all its pools
export const coinsFromPairs = (pairs: unknown): Map<string, Coin> => {
  const out = new Map<string, Coin>();
  if (!Array.isArray(pairs)) return out;
  for (const p of pairs as DsPair[]) {
    if (!isSlug(p.chainId) || !p.baseToken?.address || !p.priceUsd || !p.pairAddress) continue;
    const chainId = CHAINS[p.chainId];
    const address = normAddress(chainId, p.baseToken.address);
    if (!address) continue;
    const key = keyOf({ chainId, address });
    const prev = out.get(key);
    const liquidity = p.liquidity?.usd ?? 0;
    const volume = p.volume?.h24 ?? 0;
    if (prev && prev.liquidity >= liquidity) {
      prev.volume24h += volume;
      prev.image ??= realImage(p.info?.imageUrl);
      continue;
    }
    out.set(key, {
      chainId,
      address,
      symbol: p.baseToken.symbol ?? "?",
      name: p.baseToken.name ?? p.baseToken.symbol ?? "unknown",
      image: realImage(p.info?.imageUrl) ?? prev?.image ?? null,
      decimals: null,
      priceUsd: p.priceUsd,
      change24h: Math.round((p.priceChange?.h24 ?? 0) * 10_000) / 1_000_000,
      volume24h: volume + (prev?.volume24h ?? 0),
      liquidity,
      marketCap: p.marketCap ?? p.fdv ?? 0,
      pair: p.pairAddress,
      createdAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : 0,
    });
  }
  return out;
};

export const withMeta = (c: Coin, m: Meta | undefined): Coin => (m ? { ...c, decimals: m.decimals, image: c.image ?? m.image } : c);

export const listable = (c: Coin, minVolume = MIN_VOLUME) =>
  c.decimals !== null && !!c.image && Number(c.priceUsd) > 0 && c.liquidity >= MIN_LIQUIDITY && c.volume24h >= minVolume && !MAJORS.has(c.symbol.toUpperCase());

const plain = (x: string): string | null => {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(x);
  if (!m) return null;
  const digits = m[1]! + (m[2] ?? "");
  const point = m[1]!.length + Number(m[3] ?? 0);
  if (point > 40) return null;
  return point <= 0 ? `0.${"0".repeat(-point)}${digits}` : `${digits.padEnd(point, "0").slice(0, point)}.${digits.slice(point)}`;
};

export const usdUnits = (x: string | number | null | undefined): string => {
  if (x === null || x === undefined || (typeof x === "number" && !(x > 0))) return "0";
  const s = plain(String(x).trim());
  if (!s) return "0";
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole! + frac.padEnd(18, "0").slice(0, 18)).toString();
};

export const toInfo = (c: Coin): TokenInfo => ({
  address: c.address,
  chainId: c.chainId,
  symbol: c.symbol,
  name: c.name,
  image: c.image,
  decimals: c.decimals ?? 18,
  kind: "meme",
  venue: "relay",
  creator: null,
  priceMusd: usdUnits(c.priceUsd),
  change24h: c.change24h,
  volume24hMusd: usdUnits(c.volume24h),
  marketCapMusd: usdUnits(c.marketCap),
  curveProgress: null,
  pool: isEvm(c.pair) ? getAddress(c.pair) : null,
  holders: 0,
  createdAt: c.createdAt,
});

export const rankTrending = (coins: Coin[]) => coins.filter((c) => listable(c)).sort((a, b) => b.volume24h - a.volume24h);
export const rankNew = (coins: Coin[], now: number) =>
  coins.filter((c) => listable(c, MIN_VOLUME_NEW) && c.createdAt >= now - NEW_WINDOW).sort((a, b) => b.createdAt - a.createdAt);

export const junkLaunch = (t: TokenInfo) => t.kind === "launch" && !t.image && BigInt(t.volume24hMusd) < JUNK_LAUNCH_VOLUME;

const byVolume = (a: TokenInfo, b: TokenInfo) => {
  const d = BigInt(b.volume24hMusd) - BigInt(a.volume24hMusd);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
};

export const mergeLists = (sort: TokenSort, mezo: TokenInfo[], memes: TokenInfo[]): TokenInfo[] => {
  if (sort === "stocks") return mezo;
  if (sort === "new") return [...mezo, ...memes].sort((a, b) => b.createdAt - a.createdAt).slice(0, LIST_LIMIT);
  const live = mezo.filter((t) => !junkLaunch(t));
  const btc = live.filter((t) => t.kind === "btc");
  return [...btc, ...[...live.filter((t) => t.kind !== "btc"), ...memes].sort(byVolume)].slice(0, LIST_LIMIT);
};

export const GT_TF: Record<CandleTf, { unit: "minute" | "hour" | "day"; aggregate: number; ttlMs: number }> = {
  "1m": { unit: "minute", aggregate: 1, ttlMs: 30_000 },
  "5m": { unit: "minute", aggregate: 5, ttlMs: 60_000 },
  "1h": { unit: "hour", aggregate: 1, ttlMs: 5 * 60_000 },
  "1d": { unit: "day", aggregate: 1, ttlMs: 30 * 60_000 },
};

export const geckoCandles = (json: unknown): Candle[] => {
  const list = (json as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6 || !row.every((x) => typeof x === "number" && Number.isFinite(x))) continue;
    const [t, o, h, l, c, v] = row as number[];
    out.push({ t: t!, o: o!, h: h!, l: l!, c: c!, v: v! });
  }
  return out.sort((a, b) => a.t - b.t);
};

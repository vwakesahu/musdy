import { SOLANA, type Address, type Candle, type CandleTf, type TokenInfo } from "shared";
import { errMessage, log } from "../log";
import { Limiter } from "./limiter";
import {
  CHAINS,
  coinsFromPairs,
  geckoCandles,
  GT_TF,
  keyOf,
  listable,
  MIN_VOLUME_NEW,
  metaFromGeckoTokens,
  rankNew,
  rankTrending,
  refsFromGeckoPools,
  refsFromProfiles,
  slugOf,
  toInfo,
  withMeta,
  type Coin,
  type Meta,
  type Ref,
  type Slug,
} from "./map";

const DS = "https://api.dexscreener.com";
const GT = "https://api.geckoterminal.com/api/v2";
const SLUGS = Object.keys(CHAINS) as Slug[];
const BATCH = 30;
const TREND_SIZE = 60;
const NEW_SIZE = 40;
const DISCOVER_MS = 120_000;
const PRICE_MS = 10_000;
const WANTED_MS = 10 * 60_000;
const MISS_MS = 60_000;
const CANDLE_COUNT = 500;
const CANDLE_CACHE = 400;
const GECKO_WAIT_MS = 8_000;

// solana base58 rides in the address field, shared/socket.ts still types it as evm hex
export interface MemeMove {
  address: Address;
  chainId: number;
  priceMusd: string;
  change24h: number;
}

export interface MarketDeps {
  fetchJson?: (url: string) => Promise<unknown>;
  onPrices?: (moves: MemeMove[]) => void;
  now?: () => number;
  geckoGapMs?: number;
}

class HttpStatus extends Error {
  constructor(readonly status: number, url: string) {
    super(`${status} from ${url}`);
  }
}

const getJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new HttpStatus(r.status, url);
  return r.json();
};

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export class Market {
  private coins = new Map<string, Coin>();
  private meta = new Map<string, Meta>();
  private geckoTrending = new Map<Slug, Ref[]>();
  private trending: string[] = [];
  private fresh: string[] = [];
  private wanted = new Map<string, number>();
  private missing = new Map<string, number>();
  private published = new Map<string, string>();
  private candleCache = new Map<string, { at: number; data: Candle[] }>();
  private inflight = new Map<string, Promise<Candle[]>>();
  private dsSlow = new Limiter(55);
  private dsFast = new Limiter(280);
  private gecko: Limiter;
  private timers: ReturnType<typeof setInterval>[] = [];
  private busy = { discover: false, prices: false };
  private fetchJson: (url: string) => Promise<unknown>;
  private now: () => number;

  constructor(private deps: MarketDeps = {}) {
    this.fetchJson = deps.fetchJson ?? getJson;
    this.now = deps.now ?? Date.now;
    this.gecko = new Limiter(9, 60_000, deps.geckoGapMs ?? 6_000);
  }

  start() {
    void this.discover();
    this.timers.push(setInterval(() => void this.discover(), DISCOVER_MS));
    this.timers.push(setInterval(() => void this.prices(), PRICE_MS));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private async call(limiter: Limiter, url: string, maxWaitMs = Infinity): Promise<unknown> {
    if (!(await limiter.take(maxWaitMs))) throw new HttpStatus(429, url);
    try {
      return await this.fetchJson(url);
    } catch (e) {
      if (e instanceof HttpStatus && e.status === 429) limiter.exhaust();
      throw e;
    }
  }

  private async soft(limiter: Limiter, url: string): Promise<unknown> {
    try {
      return await this.call(limiter, url);
    } catch (e) {
      log("market.fetch_error", { url: url.slice(0, 120), error: errMessage(e).slice(0, 120) });
      return null;
    }
  }

  private async fetchPairs(refs: Ref[]): Promise<Map<string, Coin>> {
    const out = new Map<string, Coin>();
    const asked = new Set(refs.map(keyOf));
    const jobs: Promise<void>[] = [];
    for (const slug of SLUGS) {
      const addrs = [...new Set(refs.filter((r) => r.chainId === CHAINS[slug]).map((r) => r.address))];
      for (const batch of chunks(addrs, BATCH))
        jobs.push(
          this.soft(this.dsFast, `${DS}/tokens/v1/${slug}/${batch.join(",")}`).then((json) => {
            for (const [k, c] of coinsFromPairs(json)) if (asked.has(k)) out.set(k, c);
          }),
        );
    }
    await Promise.all(jobs);
    return out;
  }

  private async fillMeta(coins: Coin[]) {
    const jobs: Promise<void>[] = [];
    for (const slug of SLUGS) {
      const need = coins.filter((c) => c.chainId === CHAINS[slug] && !this.meta.has(keyOf(c))).map((c) => c.address);
      for (const batch of chunks(need, BATCH))
        jobs.push(this.soft(this.gecko, `${GT}/networks/${slug}/tokens/multi/${batch.join(",")}`).then((json) => metaFromGeckoTokens(json, slug, this.meta)));
    }
    await Promise.all(jobs);
  }

  private store(found: Map<string, Coin>, keys: Iterable<string>) {
    for (const k of keys) {
      const c = found.get(k);
      if (c) this.coins.set(k, withMeta(c, this.meta.get(k)));
    }
  }

  async discover() {
    if (this.busy.discover) return;
    this.busy.discover = true;
    try {
      const [top, latestBoosts, profiles, ...pools] = await Promise.all([
        this.soft(this.dsSlow, `${DS}/token-boosts/top/v1`),
        this.soft(this.dsSlow, `${DS}/token-boosts/latest/v1`),
        this.soft(this.dsSlow, `${DS}/token-profiles/latest/v1`),
        ...SLUGS.map((s) => this.soft(this.gecko, `${GT}/networks/${s}/trending_pools?include=base_token`)),
      ]);
      const refs = [...refsFromProfiles(top), ...refsFromProfiles(latestBoosts), ...refsFromProfiles(profiles)];
      SLUGS.forEach((s, i) => {
        if (pools[i]) this.geckoTrending.set(s, refsFromGeckoPools(pools[i], s, this.meta));
        refs.push(...(this.geckoTrending.get(s) ?? []));
      });
      const unique = [...new Map(refs.map((r) => [keyOf(r), r])).values()];
      const found = await this.fetchPairs(unique);
      await this.fillMeta([...found.values()].filter((c) => listable({ ...c, decimals: 0, image: c.image ?? "?" }, MIN_VOLUME_NEW)));
      this.store(found, found.keys());
      const seen = [...found.keys()].map((k) => this.coins.get(k)!).filter(Boolean);
      const trending = rankTrending(seen).slice(0, TREND_SIZE).map(keyOf);
      const fresh = rankNew(seen, Math.floor(this.now() / 1000)).slice(0, NEW_SIZE).map(keyOf);
      if (trending.length || !this.trending.length) this.trending = trending;
      if (fresh.length || !this.fresh.length) this.fresh = fresh;
      this.prune();
      log("market.discovered", { candidates: unique.length, trending: this.trending.length, fresh: this.fresh.length });
    } catch (e) {
      log("market.discover_error", { error: errMessage(e) });
    } finally {
      this.busy.discover = false;
    }
  }

  private tracked(): string[] {
    const t = this.now();
    for (const [k, at] of this.wanted) if (t - at > WANTED_MS) this.wanted.delete(k);
    return [...new Set([...this.trending, ...this.fresh, ...this.wanted.keys()])];
  }

  private prune() {
    const keep = new Set(this.tracked());
    for (const k of this.coins.keys()) if (!keep.has(k)) this.coins.delete(k);
    for (const k of this.published.keys()) if (!keep.has(k)) this.published.delete(k);
  }

  async prices(): Promise<MemeMove[]> {
    if (this.busy.prices) return [];
    this.busy.prices = true;
    try {
      const keys = this.tracked();
      const found = await this.fetchPairs(keys.map((k) => this.coins.get(k)).filter((c): c is Coin => !!c));
      this.store(found, keys);
      const moves: MemeMove[] = [];
      for (const k of keys) {
        const c = this.coins.get(k);
        if (!c) continue;
        const info = toInfo(c);
        if (info.priceMusd === "0" || this.published.get(k) === info.priceMusd) continue;
        this.published.set(k, info.priceMusd);
        moves.push({ address: c.address as Address, chainId: c.chainId, priceMusd: info.priceMusd, change24h: c.change24h });
      }
      // solana goes in its own frame so a client that rejects base58 still takes the evm batch
      if (moves.length) this.deps.onPrices?.(moves);
      return moves;
    } catch (e) {
      log("market.prices_error", { error: errMessage(e) });
      return [];
    } finally {
      this.busy.prices = false;
    }
  }

  list(sort: "trending" | "new"): TokenInfo[] {
    const keys = sort === "new" ? this.fresh : this.trending;
    return keys.map((k) => this.coins.get(k)).filter((c): c is Coin => !!c).map(toInfo);
  }

  findEvm(address: string): TokenInfo | null {
    const a = address.toLowerCase();
    for (const c of this.coins.values()) if (c.chainId !== SOLANA && c.address.toLowerCase() === a) return toInfo(c);
    return null;
  }

  private async coin(ref: Ref): Promise<Coin | null> {
    const k = keyOf(ref);
    const known = this.coins.get(k);
    if (known) return known;
    if (!slugOf(ref.chainId) || this.now() - (this.missing.get(k) ?? -Infinity) < MISS_MS) return null;
    const found = await this.fetchPairs([ref]);
    const c = found.get(k);
    if (c) await this.fillMeta([c]);
    const full = c ? withMeta(c, this.meta.get(k)) : null;
    if (!full || full.decimals === null) {
      this.missing.set(k, this.now());
      return null;
    }
    this.coins.set(k, full);
    this.wanted.set(k, this.now());
    return full;
  }

  async token(ref: Ref): Promise<TokenInfo | null> {
    const c = await this.coin(ref);
    if (c && this.wanted.has(keyOf(c))) this.wanted.set(keyOf(c), this.now());
    return c ? toInfo(c) : null;
  }

  async candles(ref: Ref, tf: CandleTf): Promise<Candle[] | null> {
    const c = await this.coin(ref);
    const slug = slugOf(ref.chainId);
    if (!c || !slug) return null;
    const key = `${keyOf(c)}:${tf}`;
    const hit = this.candleCache.get(key);
    const g = GT_TF[tf];
    if (hit && this.now() - hit.at < g.ttlMs) return hit.data;
    let job = this.inflight.get(key);
    if (!job) {
      const url = `${GT}/networks/${slug}/pools/${c.pair}/ohlcv/${g.unit}?aggregate=${g.aggregate}&limit=${CANDLE_COUNT}&currency=usd&token=${c.address}`;
      job = this.call(this.gecko, url, GECKO_WAIT_MS)
        .then((json) => {
          const data = geckoCandles(json);
          this.candleCache.delete(key);
          this.candleCache.set(key, { at: this.now(), data });
          if (this.candleCache.size > CANDLE_CACHE) this.candleCache.delete(this.candleCache.keys().next().value!);
          return data;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, job);
    }
    try {
      return await job;
    } catch (e) {
      log("market.candles_error", { key, error: errMessage(e).slice(0, 120) });
      if (hit) return hit.data;
      throw e;
    }
  }
}

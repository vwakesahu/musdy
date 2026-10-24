import type { Store } from "./store";

interface Series {
  ts: number[];
  price: bigint[];
}

// in memory price history per token, mirrored in the prices table
export class PriceBook {
  private series = new Map<string, Series>();

  constructor(private store: Store | null = null) {
    if (store) for (const p of store.allPrices()) this.push(p.token, p.ts, BigInt(p.price));
  }

  private push(token: string, ts: number, price: bigint) {
    const s = this.series.get(token) ?? { ts: [], price: [] };
    // keep the series sorted even if a backfilled point arrives late
    let i = s.ts.length;
    while (i > 0 && s.ts[i - 1]! > ts) i--;
    s.ts.splice(i, 0, ts);
    s.price.splice(i, 0, price);
    this.series.set(token, s);
  }

  record(token: string, ts: number, block: number, price: bigint) {
    const t = token.toLowerCase();
    this.push(t, ts, price);
    this.store?.insertPrice({ token: t, ts, block, price: price.toString() });
  }

  latest(token: string): bigint | null {
    const s = this.series.get(token.toLowerCase());
    return s && s.price.length ? s.price[s.price.length - 1]! : null;
  }

  // last price at or before ts, else the earliest known price
  at(token: string, ts: number): bigint | null {
    const s = this.series.get(token.toLowerCase());
    if (!s || !s.ts.length) return null;
    let lo = 0;
    let hi = s.ts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s.ts[mid]! <= ts) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return s.price[found === -1 ? 0 : found]!;
  }

  change24h(token: string, now: number): number {
    const cur = this.latest(token);
    const then = this.at(token, now - 86400);
    if (cur === null || then === null || then === 0n) return 0;
    return Number(((cur - then) * 1_000_000n) / then) / 1_000_000;
  }
}

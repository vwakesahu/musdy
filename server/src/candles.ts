import type { Candle, CandleTf } from "shared";

export const TF_SECONDS: Record<CandleTf, number> = { "1m": 60, "5m": 300, "1h": 3600, "1d": 86400 };

export interface Tick {
  ts: number;
  price: number;
  volume: number;
}

// ticks must be sorted by time, oldest first
export const buildCandles = (ticks: Tick[], tf: CandleTf): Candle[] => {
  const size = TF_SECONDS[tf];
  const out: Candle[] = [];
  for (const tick of ticks) {
    const t = tick.ts - (tick.ts % size);
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, tick.price);
      last.l = Math.min(last.l, tick.price);
      last.c = tick.price;
      last.v += tick.volume;
    } else {
      out.push({ t, o: tick.price, h: tick.price, l: tick.price, c: tick.price, v: tick.volume });
    }
  }
  return out;
};

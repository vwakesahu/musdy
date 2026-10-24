import type { PnlWindow } from "shared";

// average cost accounting. buys add their MUSD (fee included) to cost, sells realize against the average cost.
export type FlowKind = "buy" | "sell" | "in" | "out";

export interface Flow {
  ts: number;
  token: string;
  kind: FlowKind;
  amount: bigint;
  // MUSD paid on a buy, received on a sell, market value for a token deposit, unused for out
  musd: bigint;
}

export interface Holding {
  amount: bigint;
  cost: bigint;
  realized: bigint;
}

export type ValueFn = (token: string, amount: bigint, ts: number) => bigint;

// applies one flow to a holding in place. the indexer uses this for the positions table, replay for history
export const applyFlow = (h: Holding, f: Pick<Flow, "kind" | "amount" | "musd">): Holding => {
  if (f.kind === "buy" || f.kind === "in") {
    h.amount += f.amount;
    h.cost += f.musd;
  } else {
    const sold = f.amount > h.amount ? h.amount : f.amount;
    const removed = h.amount === 0n ? 0n : (h.cost * sold) / h.amount;
    if (f.kind === "sell") h.realized += f.musd - removed;
    h.amount -= sold;
    h.cost -= removed;
  }
  return h;
};

export const replay = (flows: Flow[], until = Number.POSITIVE_INFINITY): Map<string, Holding> => {
  const book = new Map<string, Holding>();
  for (const f of flows) {
    if (f.ts > until) continue;
    book.set(f.token, applyFlow(book.get(f.token) ?? { amount: 0n, cost: 0n, realized: 0n }, f));
  }
  return book;
};

export const pnlAt = (flows: Flow[], ts: number, value: ValueFn): bigint => {
  let total = 0n;
  for (const [token, h] of replay(flows, ts)) {
    total += h.realized;
    if (h.amount > 0n) total += value(token, h.amount, ts) - h.cost;
  }
  return total;
};

export const WINDOW_SECONDS = { d1: 86400, d7: 7 * 86400 } as const;

export const pnlWindow = (flows: Flow[], now: number, window: PnlWindow, value: ValueFn): bigint => {
  const current = pnlAt(flows, now, value);
  if (window === "all") return current;
  return current - pnlAt(flows, now - WINDOW_SECONDS[window], value);
};

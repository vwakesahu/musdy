import type { TokenInfo, TxStatus } from "shared";
import { createStore } from "./store";

export type LivePrice = { priceMusd: bigint; change24h: number };
export type Balances = { block: number; vault: Record<string, bigint>; wallet: Record<string, bigint> };

const key = (a: string) => a.toLowerCase();

export const livePrices = createStore<Record<string, LivePrice>>({});
export const liveTokens = createStore<Record<string, TokenInfo>>({});
export const liveBalances = createStore<Balances | null>(null);
export const liveTxs = createStore<Record<string, TxStatus>>({});

export const lk = key;

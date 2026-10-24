import type { TokenInfo, TxStatus } from "shared";
import { createStore } from "./store";

export type LivePrice = { priceMusd: bigint; change24h: number };
export type Balances = { block: number; vault: Record<string, bigint>; wallet: Record<string, bigint> };

const key = (a: string) => a.toLowerCase();

// prices and tokens are keyed by tokenKey, balances by lowercase address
export const livePrices = createStore<Record<string, LivePrice>>({});
export const liveTokens = createStore<Record<string, TokenInfo>>({});
export const liveBalances = createStore<Balances | null>(null);
export const liveTxs = createStore<Record<string, TxStatus>>({});

export const lk = key;

// BTC is Mezo's gas token, auto deposit leaves this much in the wallet so the vault's withdraw escape hatch stays payable
export const BTC_GAS_RESERVE = 20_000_000_000_000n;

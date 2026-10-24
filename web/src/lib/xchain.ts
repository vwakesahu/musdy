import { SOLANA, tokenKey } from "shared";
import { env } from "./env";

type ChainRef = { chainId: number; address: string };

export const isMezo = (t: { chainId: number }) => t.chainId === env.chainId;
export const keyOf = (t: ChainRef) => tokenKey(t);
export const mezoKey = (address: string) => tokenKey({ chainId: env.chainId, address });
export const tokenHref = (t: ChainRef) => `/token/${t.chainId}/${t.address}`;

export type ChainMeta = { name: string; icon: string };

const CHAINS: Record<number, ChainMeta> = {
  [SOLANA]: { name: "Solana", icon: "/chains/solana.svg" },
  8453: { name: "Base", icon: "/chains/base.svg" },
  56: { name: "BNB Chain", icon: "/chains/bsc.svg" },
  1: { name: "Ethereum", icon: "/chains/ethereum.png" },
  42161: { name: "Arbitrum", icon: "/chains/arbitrum.png" },
};

export const chainMeta = (id: number): ChainMeta | null => (id === env.chainId ? { name: "Mezo", icon: "/tokens/mezo.svg" } : (CHAINS[id] ?? null));

export const validTokenAddress = (chainId: number, address: string) =>
  chainId === SOLANA ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) : /^0x[0-9a-fA-F]{40}$/.test(address);

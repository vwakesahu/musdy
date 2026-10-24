import { SOLANA } from "shared";
import { chain } from "./chain";
import { env } from "./env";

const EXPLORERS: Record<number, string> = {
  31611: "https://explorer.test.mezo.org",
  31612: "https://explorer.mezo.org",
  8453: "https://basescan.org",
  56: "https://bscscan.com",
  [SOLANA]: "https://solscan.io",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  1: "https://etherscan.io",
};

export type TxRef = { chainId: number; hash: string };

export function txUrl(t: TxRef): string | null {
  const base = t.chainId === env.chainId ? (chain.blockExplorers?.default.url ?? EXPLORERS[t.chainId]) : EXPLORERS[t.chainId];
  return base ? `${base}/tx/${t.hash}` : null;
}

export const mezoTx = (hash: string | null | undefined): TxRef | undefined => (hash ? { chainId: env.chainId, hash } : undefined);

export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

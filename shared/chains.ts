import { defineChain } from "viem";
import type { Address } from "./types";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"], webSocket: ["wss://rpc-ws.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-internal.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
});

export type TokenKind = "musd" | "btc" | "stock" | "launch" | "other";

export interface KnownToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenKind;
}

// tokens with a live MUSD pool on mezo testnet, checked 2026-10-24
export const testnetTokens: KnownToken[] = [
  { address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503", symbol: "MUSD", name: "Mezo USD", decimals: 18, kind: "musd" },
  { address: "0x7b7C000000000000000000000000000000000000", symbol: "BTC", name: "Bitcoin", decimals: 18, kind: "btc" },
  { address: "0x0dd342913752311E88BBfb0184E3f55FAeFc866a", symbol: "NVDA", name: "NVIDIA", decimals: 18, kind: "stock" },
  { address: "0x012296B64995A9E3dB50249AFdB409a9954b1457", symbol: "GOOGL", name: "Alphabet", decimals: 18, kind: "stock" },
  { address: "0x7AdC67AB18eFa1Ce921e4054C01C5A8E8699375D", symbol: "TSLA", name: "Tesla", decimals: 18, kind: "stock" },
  { address: "0xdd8Bf5ACa0579bEE7e6cd20AC7683E279a5f7d48", symbol: "mT", name: "Threshold", decimals: 18, kind: "other" },
];

export const testnetPools = {
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as Address,
  factory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as Address,
};

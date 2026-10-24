import { defineChain } from "viem";
import type { Address } from "./types";
import type { TOKEN_KINDS } from "./types";

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

export type TokenKind = (typeof TOKEN_KINDS)[number];

export interface KnownToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenKind;
  logo?: string;
}

const LOGO_SYMBOLS = ["MUSD", "BTC", "MEZO", "NVDA", "GOOGL", "TSLA", "COIN", "CRCL"];

export const tokenLogo = (symbol: string): string | undefined =>
  LOGO_SYMBOLS.includes(symbol) ? `/tokens/${symbol.toLowerCase()}.svg` : undefined;

export const testnetTokens: KnownToken[] = [
  { address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503", symbol: "MUSD", name: "Mezo USD", decimals: 18, kind: "musd", logo: "/tokens/musd.svg" },
  { address: "0x7b7C000000000000000000000000000000000000", symbol: "BTC", name: "Bitcoin", decimals: 18, kind: "btc", logo: "/tokens/btc.svg" },
  { address: "0x0dd342913752311E88BBfb0184E3f55FAeFc866a", symbol: "NVDA", name: "NVIDIA", decimals: 18, kind: "stock", logo: "/tokens/nvda.svg" },
  { address: "0x012296B64995A9E3dB50249AFdB409a9954b1457", symbol: "GOOGL", name: "Alphabet", decimals: 18, kind: "stock", logo: "/tokens/googl.svg" },
  { address: "0x7AdC67AB18eFa1Ce921e4054C01C5A8E8699375D", symbol: "TSLA", name: "Tesla", decimals: 18, kind: "stock", logo: "/tokens/tsla.svg" },
  { address: "0x9E15Eb378a6428aa9880bF7aa1C333929fDB199F", symbol: "COIN", name: "Coinbase", decimals: 18, kind: "stock", logo: "/tokens/coin.svg" },
  { address: "0xE8856cD7F6dd14962bF00Df2738C93957BdD4904", symbol: "CRCL", name: "Circle", decimals: 18, kind: "stock", logo: "/tokens/crcl.svg" },
];

export const testnetPools = {
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as Address,
  factory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as Address,
};

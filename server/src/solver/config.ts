import { getAddress } from "viem";
import { SOLANA } from "shared";

export const BASE = 8453;
export const BSC = 56;
export const ETHEREUM = 1;
export const ARBITRUM = 42161;
export const OPTIMISM = 10;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_TO_MUSD = 10n ** 12n;

export const COIN_CHAINS = new Set([SOLANA, BASE, BSC]);

export interface DepositRoute {
  chainId: number;
  name: string;
  currency: string;
  token: string;
  decimals: number;
  refundTo: string;
  sample: string;
}

const EVM_NATIVE = "0x0000000000000000000000000000000000000000";
const SOL_NATIVE = "11111111111111111111111111111111";

export const DEPOSIT_ROUTES: DepositRoute[] = [
  { chainId: SOLANA, name: "Solana", currency: "USDC", token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, refundTo: SOL_NATIVE, sample: "10000000" },
  { chainId: BASE, name: "Base", currency: "USDC", token: BASE_USDC, decimals: 6, refundTo: EVM_NATIVE, sample: "10000000" },
  { chainId: BSC, name: "BNB Chain", currency: "USDC", token: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, refundTo: EVM_NATIVE, sample: "10000000000000000000" },
  { chainId: ETHEREUM, name: "Ethereum", currency: "USDC", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, refundTo: EVM_NATIVE, sample: "10000000" },
  { chainId: ARBITRUM, name: "Arbitrum", currency: "USDC", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, refundTo: EVM_NATIVE, sample: "10000000" },
];

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

export const coinAddress = (chainId: number, a: string): string | null => {
  if (!COIN_CHAINS.has(chainId)) return null;
  if (chainId === SOLANA) return BASE58.test(a) ? a : null;
  return EVM.test(a) ? getAddress(a) : null;
};

export interface SolverEnv {
  SOLVER_KEY?: `0x${string}`;
  SOLVER_SOLANA_KEY?: string;
  SOLVER_AUTO_GAS?: boolean;
  RELAY_API_KEY?: string;
  RELAY_URL: string;
  BASE_RPC_URL?: string;
  BSC_RPC_URL?: string;
  SOLANA_RPC_URL?: string;
  ETHEREUM_RPC_URL?: string;
  ARBITRUM_RPC_URL?: string;
  OPTIMISM_RPC_URL?: string;
}

export interface SweepRoute {
  chainId: number;
  name: string;
  token: `0x${string}`;
  rpc: (env: SolverEnv) => string;
}

// native usdc that lands in a user's own address, swept with an eip3009 authorization
export const SWEEP_ROUTES: SweepRoute[] = [
  { chainId: BASE, name: "Base", token: BASE_USDC, rpc: (e) => e.BASE_RPC_URL ?? "https://base-rpc.publicnode.com" },
  { chainId: ARBITRUM, name: "Arbitrum", token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: (e) => e.ARBITRUM_RPC_URL ?? "https://arbitrum-one-rpc.publicnode.com" },
  { chainId: OPTIMISM, name: "Optimism", token: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpc: (e) => e.OPTIMISM_RPC_URL ?? "https://optimism-rpc.publicnode.com" },
  { chainId: ETHEREUM, name: "Ethereum", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpc: (e) => e.ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com" },
];

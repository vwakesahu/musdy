import { z } from "zod";
import { Deployment, deployments } from "shared";

const zKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((s) => s as `0x${string}`);

export const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  CHAIN_ID: z.coerce.number().int(),
  RPC_URL: z.string().url(),
  RPC_WS: z.string().url().optional(),
  RELAYER_KEY: zKey,
  FAUCET_KEY: z.preprocess((v) => (v === "" ? undefined : v), zKey.optional()),
  DB_PATH: z.string().default("./musdy.db"),
  FAUCET_HOURLY_CAP: z.coerce.number().int().positive().default(50),
  TRUST_PROXY: z.enum(["0", "1", ""]).default("0").transform((v) => v === "1"),
  MARKET: z.enum(["0", "1", ""]).default("1").transform((v) => v !== "0"),
  SOLVER_KEY: z.preprocess((v) => (v === "" ? undefined : v), zKey.optional()),
  SOLVER_SOLANA_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  SOLVER_AUTO_GAS: z.enum(["0", "1", ""]).default("0").transform((v) => v === "1"),
  RELAY_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  RELAY_URL: z.string().url().default("https://api.relay.link"),
  BASE_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  BSC_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  SOLANA_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  ETHEREUM_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  ARBITRUM_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  OPTIMISM_RPC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
});
export type Env = z.infer<typeof Env>;

export const MAINNET_ID = 31612;

export const loadEnv = (src: Record<string, string | undefined> = process.env): Env => Env.parse(src);

export const deploymentFor = (chainId: number, all: unknown = deployments): Deployment => {
  const entry = (all as Record<string, unknown>)[String(chainId)];
  if (!entry) throw new Error(`shared/deployments.json has no entry for chain ${chainId}`);
  return Deployment.parse(entry);
};

export const faucetEnabled = (env: Pick<Env, "FAUCET_KEY" | "CHAIN_ID">): boolean =>
  !!env.FAUCET_KEY && env.CHAIN_ID !== MAINNET_ID;

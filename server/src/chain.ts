import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { mezoMainnet, mezoTestnet } from "shared";
import type { Env } from "./env";

export const chainFor = (id: number, rpcUrl: string): Chain => {
  const base = id === mezoTestnet.id ? mezoTestnet : id === mezoMainnet.id ? mezoMainnet : id === anvil.id ? anvil : null;
  if (!base) throw new Error(`unsupported CHAIN_ID ${id}`);
  return { ...base, rpcUrls: { default: { http: [rpcUrl] } } };
};

export type Wallet = WalletClient<Transport, Chain, Account>;

export interface Clients {
  chain: Chain;
  pub: PublicClient<Transport, Chain>;
  watch: PublicClient<Transport, Chain>;
  relayer: Wallet;
  faucet: Wallet | null;
  close(): Promise<void>;
}

export const makeClients = (env: Env): Clients => {
  const chain = chainFor(env.CHAIN_ID, env.RPC_URL);
  const transport = http(env.RPC_URL, { batch: true });
  const pub = createPublicClient({ chain, transport, pollingInterval: 1000 });
  const ws = env.RPC_WS ? webSocket(env.RPC_WS) : null;
  const watch = ws ? createPublicClient({ chain, transport: ws, pollingInterval: 1000 }) : pub;
  const close = async () => {
    if (ws) (await ws({ chain }).value?.getRpcClient())?.close();
  };
  const wallet = (key: `0x${string}`): Wallet =>
    createWalletClient({ chain, transport: http(env.RPC_URL), account: privateKeyToAccount(key) });
  return { chain, pub, watch, close, relayer: wallet(env.RELAYER_KEY), faucet: env.FAUCET_KEY ? wallet(env.FAUCET_KEY) : null };
};

export const hasMulticall = (chain: Chain): boolean => !!chain.contracts?.multicall3;

import { createPublicClient, defineChain, http } from "viem";
import { foundry } from "viem/chains";
import { createConfig } from "wagmi";
import { mezoMainnet, mezoTestnet } from "shared";
import { env } from "./env";

const base = env.chainId === 31611 ? mezoTestnet : env.chainId === 31612 ? mezoMainnet : foundry;

export const chain = defineChain({ ...base, id: env.chainId, rpcUrls: { default: { http: [env.rpcUrl] } } });

export const publicClient = createPublicClient({ chain, transport: http(env.rpcUrl) });

export const wagmiConfig = createConfig({ chains: [chain], transports: { [chain.id]: http(env.rpcUrl) }, ssr: true });

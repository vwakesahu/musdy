import type { Hex } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
const devKey = process.env.NEXT_PUBLIC_DEV_KEY ?? "";

export const env = {
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  chainId,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
  serverUrl: (process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8080").replace(/\/$/, ""),
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || "ws://localhost:8080/ws",
};

// the dev key is a throwaway anvil key and is refused on every chain but local anvil
export const devKeyState: "off" | "ok" | "refused" = !devKey ? "off" : chainId === 31337 ? "ok" : "refused";
export const devPrivateKey = (devKeyState === "ok" && /^0x[0-9a-fA-F]{64}$/.test(devKey) ? devKey : null) as Hex | null;

export const faucetEnabled = chainId === 31337 || chainId === 31611;

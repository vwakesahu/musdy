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

const ANVIL = 31337;

// the dev key is a throwaway anvil key and is refused on every chain but local anvil
export const devKeyState: "off" | "ok" | "refused" = !devKey ? "off" : chainId === ANVIL ? "ok" : "refused";
const isKey = (k: string | null | undefined): k is Hex => !!k && /^0x[0-9a-fA-F]{64}$/.test(k);
const devKeyHex = (devKeyState === "ok" && isKey(devKey) ? devKey : null) as Hex | null;

export type ServerChains = { config: number | null; socket: number | null };

export function chainMismatch(s: ServerChains): string | null {
  for (const [where, id] of [
    ["server", s.config],
    ["live socket", s.socket],
  ] as const) {
    if (id !== null && id !== chainId) return `This app is built for chain ${chainId} but the ${where} runs chain ${id}. Signing is off until the config matches.`;
  }
  return null;
}

// signing waits until the server's own config confirms the chain
export const signingAllowed = (s: ServerChains) => s.config === chainId && chainMismatch(s) === null;

// the dev key only when build, server and socket all say local anvil, where localStorage "musdy:devkey" overrides it
export const DEV_KEY_STORAGE = "musdy:devkey";
export const devPrivateKey = (s: ServerChains, stored?: string | null): Hex | null => {
  if (!devKeyHex || chainId !== ANVIL || s.config !== ANVIL || s.socket !== ANVIL) return null;
  return isKey(stored) ? stored : devKeyHex;
};

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
const devKeyHex = (devKeyState === "ok" && /^0x[0-9a-fA-F]{64}$/.test(devKey) ? devKey : null) as Hex | null;

// what the server says it runs, from /config and from the socket welcome. null until heard
export type ServerChains = { config: number | null; socket: number | null };

// a chain the server reports that isn't the one this build signs for, null when nothing disagrees
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

// the dev key only when the build, the server config and the socket all say local anvil
export const devPrivateKey = (s: ServerChains): Hex | null =>
  devKeyHex && chainId === ANVIL && s.config === ANVIL && s.socket === ANVIL ? devKeyHex : null;

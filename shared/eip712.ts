// the typed data both sides use, web signs with it and server verifies with it
import type { Address } from "./types";

export const domainFor = (chainId: number, vault: Address) =>
  ({ name: "musdy", version: "1", chainId, verifyingContract: vault }) as const;

export const tradeTypes = {
  Trade: [
    { name: "user", type: "address" },
    { name: "token", type: "address" },
    { name: "isBuy", type: "bool" },
    { name: "amountIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "ref", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const withdrawTypes = {
  Withdraw: [
    { name: "user", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "to", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const launchTypes = {
  Launch: [
    { name: "user", type: "address" },
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "image", type: "string" },
    { name: "initialBuy", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// erc2612 permit, MUSD and BTC on mezo both support it
export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// plain personal_sign messages for off chain profile actions, valid for 5 minutes
export const profileMessage = (handle: string, issued: string) => `musdy profile\nhandle: ${handle}\nissued: ${issued}`;
export const followMessage = (target: Address, follow: boolean, issued: string) =>
  `musdy ${follow ? "follow" : "unfollow"}\ntarget: ${target.toLowerCase()}\nissued: ${issued}`;

export const faucetMessage = (address: Address, issued: string) => `musdy faucet\naddress: ${address.toLowerCase()}\nissued: ${issued}`;

// permit domains differ per token. MUSD exposes eip712Domain() and nonces(owner).
// the BTC precompile has no eip712Domain(), its domain is name "BTC" version "1", and its nonce getter is nonce(owner).
// sign by trying eip712Domain() and nonces() first and fall back to this only when they revert.
export const btcPermitDomain = (chainId: number, btc: Address) =>
  ({ name: "BTC", version: "1", chainId, verifyingContract: btc }) as const;

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

export const intentTypes = {
  Intent: [
    { name: "user", type: "address" },
    { name: "isBuy", type: "bool" },
    { name: "chainId", type: "uint256" },
    { name: "token", type: "string" },
    { name: "amountIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "ref", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// eip3009 on native usdc, the domain is the token's own (name "USD Coin", version "2" on base)
export const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const profileMessage = (handle: string, issued: string) => `musdy profile\nhandle: ${handle}\nissued: ${issued}`;
export const followMessage = (target: Address, follow: boolean, issued: string) =>
  `musdy ${follow ? "follow" : "unfollow"}\ntarget: ${target.toLowerCase()}\nissued: ${issued}`;

export const faucetMessage = (address: Address, issued: string) => `musdy faucet\naddress: ${address.toLowerCase()}\nissued: ${issued}`;

// BTC precompile has no eip712Domain(): domain "BTC"/"1", nonce(owner); try the standard getters first
export const btcPermitDomain = (chainId: number, btc: Address) =>
  ({ name: "BTC", version: "1", chainId, verifyingContract: btc }) as const;

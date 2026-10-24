// the http contract. request bodies are validated with these on the server and built with them on the web.
import { z } from "zod";
import { Candle, Deployment, FeedItem, LeaderRow, Profile, TokenInfo, TxStatus, zAddress, zHex, zUint } from "./types";

export const TradeBody = z.object({
  trade: z.object({
    user: zAddress,
    token: zAddress,
    isBuy: z.boolean(),
    amountIn: zUint,
    minOut: zUint,
    ref: zAddress,
    nonce: zUint,
    deadline: zUint,
  }),
  sig: zHex,
});
export const WithdrawBody = z.object({
  withdraw: z.object({ user: zAddress, token: zAddress, amount: zUint, to: zAddress, nonce: zUint, deadline: zUint }),
  sig: zHex,
});
export const LaunchBody = z.object({
  launch: z.object({
    user: zAddress,
    name: z.string().min(1).max(32),
    symbol: z.string().min(1).max(10),
    image: z.string().url().max(256).or(z.literal("")),
    initialBuy: zUint,
    nonce: zUint,
    deadline: zUint,
  }),
  sig: zHex,
});
export const PermitDepositBody = z.object({
  owner: zAddress,
  token: zAddress,
  amount: zUint,
  deadline: zUint,
  v: z.number().int(),
  r: zHex,
  s: zHex,
});
export const FaucetBody = z.object({ address: zAddress });
export const ProfileBody = z.object({ address: zAddress, handle: z.string().regex(/^[a-z0-9_]{3,15}$/), issued: z.string(), sig: zHex });
export const FollowBody = z.object({ address: zAddress, target: zAddress, follow: z.boolean(), issued: z.string(), sig: zHex });

// every POST that submits a chain tx answers with this, then progress arrives as tx messages on user:<addr>
export const Accepted = TxStatus;

export const Health = z.object({ ok: z.boolean(), block: z.number(), chainId: z.number(), relayer: zAddress, relayerBtc: zUint });
export const Quote = z.object({ amountOut: zUint, fee: zUint, priceImpact: z.number(), venue: z.enum(["pool", "curve"]) });
export const Nonce = z.object({ nonce: zUint });

export const routes = {
  // GET
  health: "/health", // Health
  config: "/config", // Deployment
  tokens: "/tokens", // ?sort=trending|new|stocks  -> TokenInfo[]
  token: "/tokens/:address", // TokenInfo
  candles: "/tokens/:address/candles", // ?tf=1m|5m|1h|1d -> Candle[]
  tokenTrades: "/tokens/:address/trades", // ?before=<id> -> FeedItem[]
  feed: "/feed", // ?scope=global|following&address=&before= -> FeedItem[]
  user: "/users/:address", // ?viewer=<addr> -> Profile
  userTrades: "/users/:address/trades", // FeedItem[]
  leaderboard: "/leaderboard", // ?window=d1|d7|all -> LeaderRow[]
  quote: "/quote", // ?token=&isBuy=&amountIn= -> Quote
  nonce: "/nonce/:address", // Nonce, the vault nonce
  // POST
  trade: "/actions/trade", // TradeBody -> Accepted
  withdraw: "/actions/withdraw", // WithdrawBody -> Accepted
  launch: "/actions/launch", // LaunchBody -> Accepted
  deposit: "/actions/deposit", // PermitDepositBody -> Accepted
  faucet: "/faucet", // FaucetBody -> Accepted, testnet and local only
  profile: "/profile", // ProfileBody -> Profile
  follow: "/follow", // FollowBody -> { ok: true }
} as const;

export const ErrorBody = z.object({ code: z.string(), message: z.string() });

export type TradeBody = z.infer<typeof TradeBody>;
export type WithdrawBody = z.infer<typeof WithdrawBody>;
export type LaunchBody = z.infer<typeof LaunchBody>;
export type PermitDepositBody = z.infer<typeof PermitDepositBody>;
export type FaucetBody = z.infer<typeof FaucetBody>;
export type ProfileBody = z.infer<typeof ProfileBody>;
export type FollowBody = z.infer<typeof FollowBody>;
export type Health = z.infer<typeof Health>;
export type Quote = z.infer<typeof Quote>;
export type Nonce = z.infer<typeof Nonce>;
export type ErrorBody = z.infer<typeof ErrorBody>;
export { Candle, Deployment, FeedItem, LeaderRow, Profile, TokenInfo };

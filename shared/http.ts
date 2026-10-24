// the http contract. request bodies are validated with these on the server and built with them on the web.
import { z } from "zod";
import { Candle, Deployment, FeedItem, LeaderRow, Profile, TokenInfo, TxStatus, zAddress, zHex, zUint, zVenue, zIssued } from "./types";

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
    // limits are utf8 bytes like the contract checks
    name: z.string().min(1).refine((v) => new TextEncoder().encode(v).length <= 32, "name is over 32 bytes"),
    symbol: z.string().min(1).refine((v) => new TextEncoder().encode(v).length <= 10, "symbol is over 10 bytes"),
    image: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//.test(u), "image must be an http(s) url")
      .refine((v) => new TextEncoder().encode(v).length <= 256, "image url is over 256 bytes")
      .or(z.literal("")),
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
export const FaucetBody = z.object({ address: zAddress, issued: zIssued, sig: zHex });
export const ProfileBody = z.object({ address: zAddress, handle: z.string().regex(/^[a-z0-9_]{3,15}$/), issued: zIssued, sig: zHex });
export const FollowBody = z.object({ address: zAddress, target: zAddress, follow: z.boolean(), issued: zIssued, sig: zHex });

// every POST that submits a chain tx answers with this, then progress arrives as tx messages on user:<addr>
export const Accepted = TxStatus;

export const Health = z.object({ ok: z.boolean(), block: z.number(), chainId: z.number(), relayer: zAddress, relayerBtc: zUint, faucet: z.boolean() });

// query params, parse them with these on the server and type them with these on the web
export const TokenSort = z.enum(["trending", "new", "stocks"]);
export const CandleTf = z.enum(["1m", "5m", "1h", "1d"]);
export const PnlWindow = z.enum(["d1", "d7", "all"]);
export const FeedScope = z.enum(["global", "following"]);
export type TokenSort = z.infer<typeof TokenSort>;
export type CandleTf = z.infer<typeof CandleTf>;
export type PnlWindow = z.infer<typeof PnlWindow>;
export type FeedScope = z.infer<typeof FeedScope>;
export const Quote = z.object({ amountOut: zUint, fee: zUint, priceImpact: z.number(), venue: zVenue });
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
  faucet: "/faucet", // FaucetBody -> Accepted, only when Health.faucet is true
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

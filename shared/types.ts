// domain types shared by server and web. only the lead edits this file.
import { z } from "zod";

export type Address = `0x${string}`;
export const zAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s as Address);
export const zHex = z.string().regex(/^0x[0-9a-fA-F]*$/).transform((s) => s as `0x${string}`);
// bigints travel as decimal strings, 18 decimals unless the token says otherwise
export const zUint = z.string().regex(/^\d+$/);

export const VENUES = ["pool", "curve"] as const; // index matches the solidity Venue enum
export const zVenue = z.enum(VENUES);
export const TOKEN_KINDS = ["musd", "btc", "stock", "launch", "other"] as const;
export const zTokenKind = z.enum(TOKEN_KINDS);

export const UserRef = z.object({
  address: zAddress,
  handle: z.string().nullable(),
  avatar: z.string().nullable(),
});
export type UserRef = z.infer<typeof UserRef>;

export const TokenRef = z.object({
  address: zAddress,
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  decimals: z.number(),
});
export type TokenRef = z.infer<typeof TokenRef>;

export const TokenInfo = TokenRef.extend({
  kind: zTokenKind,
  venue: zVenue,
  creator: zAddress.nullable(),
  priceMusd: zUint, // MUSD per 1 whole token, 1e18 scaled
  change24h: z.number(), // fraction, 0.12 is +12%
  volume24hMusd: zUint,
  marketCapMusd: zUint,
  curveProgress: z.number().nullable(), // 0..1 while on the curve, null otherwise
  pool: zAddress.nullable(),
  holders: z.number(), // addresses with a non zero vault balance of this token
  createdAt: z.number(), // unix seconds
});
export type TokenInfo = z.infer<typeof TokenInfo>;

export const FeedItem = z.object({
  id: z.string(), // txHash:logIndex
  block: z.number(),
  ts: z.number(),
  user: UserRef,
  token: TokenRef,
  isBuy: z.boolean(),
  musdAmount: zUint,
  tokenAmount: zUint,
  priceMusd: zUint,
  marketCapMusd: zUint, // at the time of the trade
  ref: UserRef.nullable(), // the trader this one copied
  venue: zVenue,
  txHash: zHex,
});
export type FeedItem = z.infer<typeof FeedItem>;

export const Position = z.object({
  token: TokenRef,
  amount: zUint,
  avgCostMusd: zUint, // per whole token, 1e18 scaled
  valueMusd: zUint,
  costMusd: zUint,
  pnlMusd: z.string(), // signed decimal string, 1e18 scaled
  pnlPct: z.number(),
  withdrawable: z.boolean(), // false while a launch token is still on its curve
});
export type Position = z.infer<typeof Position>;

export const Pnl = z.object({ d1: z.string(), d7: z.string(), all: z.string() }); // signed, 1e18 scaled
export type Pnl = z.infer<typeof Pnl>;

export const Profile = z.object({
  user: UserRef,
  balanceMusd: zUint, // cash in the vault
  totalValueMusd: zUint, // cash plus positions
  pnl: Pnl,
  positions: z.array(Position),
  followers: z.number(),
  following: z.number(),
  followedByViewer: z.boolean().nullable(), // null when no ?viewer= was given
  trades: z.number(),
});
export type Profile = z.infer<typeof Profile>;

export const LeaderRow = z.object({
  rank: z.number(),
  user: UserRef,
  pnlMusd: z.string(),
  pnlPct: z.number(),
  volumeMusd: zUint,
  trades: z.number(),
});
export type LeaderRow = z.infer<typeof LeaderRow>;

// candle prices are MUSD per whole token and v is MUSD volume, floats in whole units for the chart only
export const Candle = z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() });
export type Candle = z.infer<typeof Candle>;

export const TxStatus = z.object({
  id: z.string(),
  kind: z.enum(["deposit", "trade", "withdraw", "launch", "faucet"]),
  status: z.enum(["pending", "confirmed", "failed"]),
  hash: zHex.nullable(),
  error: z.string().nullable(),
});
export type TxStatus = z.infer<typeof TxStatus>;

export const Deployment = z.object({
  chainId: z.number(),
  vault: zAddress,
  launchpad: zAddress,
  musd: zAddress,
  btc: zAddress,
  router: zAddress,
  factory: zAddress,
  startBlock: z.number(),
  tokens: z.array(z.object({ address: zAddress, symbol: z.string(), name: z.string(), decimals: z.number(), kind: zTokenKind })),
});
export type Deployment = z.infer<typeof Deployment>;

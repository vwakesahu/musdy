import { z } from "zod";
import { FeedItem, TokenInfo, TxStatus, zAddress, zUint } from "./types";

// topics are lowercase on the wire, build them with topicKey so routing never depends on case
export const Topic = z
  .union([
    z.literal("feed:global"),
    z.literal("tokens"),
    z.literal("prices"),
    z.string().regex(/^feed:following:0x[0-9a-fA-F]{40}$/),
    z.string().regex(/^token:(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/),
    z.string().regex(/^user:0x[0-9a-fA-F]{40}$/),
  ])
  .transform((t) => t.toLowerCase());
export const topicKey = (t: string) => t.toLowerCase();

export const ClientMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), address: zAddress.optional() }),
  z.object({ type: z.literal("subscribe"), topic: Topic }),
  z.object({ type: z.literal("unsubscribe"), topic: Topic }),
]);

export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("welcome"), serverTime: z.number(), block: z.number(), chainId: z.number() }),
  z.object({ type: z.literal("trade"), topic: z.string(), item: FeedItem, replay: z.boolean() }),
  z.object({ type: z.literal("token"), topic: z.string(), token: TokenInfo }),
  z.object({
    type: z.literal("prices"),
    topic: z.string(),
    block: z.number(),
    prices: z.array(z.object({ address: z.string(), chainId: z.number(), priceMusd: zUint, change24h: z.number() })),
  }),
  z.object({
    type: z.literal("balances"),
    topic: z.string(),
    block: z.number(),
    vault: z.array(z.object({ token: zAddress, amount: zUint })),
    wallet: z.array(z.object({ token: zAddress, amount: zUint })),
    // usdc sitting in the user's own address on other evm chains, swept with an eip3009 authorization
    external: z.array(z.object({ chainId: z.number(), token: zAddress, amount: zUint })).default([]),
  }),
  z.object({ type: z.literal("tx"), topic: z.string(), tx: TxStatus }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type Topic = z.infer<typeof Topic>;
export type ClientMsg = z.infer<typeof ClientMsg>;
export type ServerMsg = z.infer<typeof ServerMsg>;

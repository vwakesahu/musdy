// the socket contract. every message the server sends or accepts is declared here.
// topics: feed:global, feed:following:<addr>, token:<addr>, user:<addr>, tokens, prices
import { z } from "zod";
import { FeedItem, TokenInfo, TxStatus, zAddress, zUint } from "./types";

// topics are lowercase on the wire, build them with topicKey so routing never depends on case
export const Topic = z
  .union([
    z.literal("feed:global"),
    z.literal("tokens"),
    z.literal("prices"),
    z.string().regex(/^feed:following:0x[0-9a-fA-F]{40}$/),
    z.string().regex(/^token:0x[0-9a-fA-F]{40}$/),
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
  // feed:global, feed:following:*, token:*, user:*. replayed newest 50 on subscribe with replay true
  z.object({ type: z.literal("trade"), topic: z.string(), item: FeedItem, replay: z.boolean() }),
  // tokens: a launch, a graduation, or a curve/price change worth re-rendering a card
  z.object({ type: z.literal("token"), topic: z.string(), token: TokenInfo }),
  // prices: batched each block, only tokens whose price moved
  z.object({
    type: z.literal("prices"),
    topic: z.string(),
    block: z.number(),
    prices: z.array(z.object({ address: zAddress, priceMusd: zUint, change24h: z.number() })),
  }),
  // user:<addr>: vault balances after any change, and the wallet (not vault) balances used for auto deposit
  z.object({
    type: z.literal("balances"),
    topic: z.string(),
    block: z.number(),
    vault: z.array(z.object({ token: zAddress, amount: zUint })),
    wallet: z.array(z.object({ token: zAddress, amount: zUint })),
  }),
  // user:<addr>: lifecycle of anything the relayer submitted for this user
  z.object({ type: z.literal("tx"), topic: z.string(), tx: TxStatus }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type Topic = z.infer<typeof Topic>;
export type ClientMsg = z.infer<typeof ClientMsg>;
export type ServerMsg = z.infer<typeof ServerMsg>;

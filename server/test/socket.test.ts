import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import type { FeedItem, ServerMsg } from "shared";
import { openDb } from "../src/db";
import { CLOSE_RATE_LIMIT, Hub, MAX_SOCKETS_PER_IP, MAX_TOPICS, type WsData } from "../src/hub";
import { PriceBook } from "../src/price-book";
import { Store } from "../src/store";
import { Views } from "../src/views";
import { CONTRACTS_READY, SKIP_NOTE, startStack, tempDb, type Stack } from "./helpers/anvil";
import { Actor } from "./helpers/actors";
import { TestSocket } from "./helpers/ws";

const TOKEN = "0x00000000000000000000000000000000000000aa";
const MUSD = "0x00000000000000000000000000000000000000bb";
const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const tradeIds = (msgs: ServerMsg[]) => msgs.flatMap((m) => (m.type === "trade" ? [m.item.id] : []));

const row = (i: number, user: string) => ({
  id: `0x${i.toString(16).padStart(64, "0")}:0`,
  block: i,
  log_index: 0,
  ts: 1_700_000_000 + i,
  tx_hash: `0x${i.toString(16).padStart(64, "0")}`,
  user,
  token: TOKEN,
  is_buy: 1,
  musd_amount: "1000000000000000000",
  token_amount: "1000000000000000000",
  fee: "0",
  ref: null,
  venue: "pool" as const,
  price: "1000000000000000000",
  price_f: 1,
  musd_f: 1,
});

// the real hub, views and sqlite store behind a real Bun.serve, with trades seeded straight into the db
describe("socket hub", () => {
  let server: Server<WsData>;
  let store: Store;
  let hub: Hub;
  let url: string;
  let views: Views;

  beforeAll(() => {
    store = new Store(openDb(tempDb()));
    store.seedToken({ address: TOKEN, symbol: "TKN", name: "Token", decimals: 18, kind: "stock", createdAt: 0 });
    for (let i = 1; i <= 60; i++) store.insertTrade(row(i, i % 2 ? ALICE : BOB));
    views = new Views(store, new PriceBook(store), MUSD, 1n, () => 60);
    hub = new Hub({
      welcome: () => ({ type: "welcome", serverTime: Date.now(), block: 60, chainId: 31337 }),
      replay: (t) => views.replay(t),
    });
    server = Bun.serve<WsData>({
      port: 0,
      fetch: (req, srv) => {
        const data = hub.admit(req.headers.get("x-forwarded-for") ?? "local");
        if (!data) return new Response("too many", { status: 429 });
        return srv.upgrade(req, { data }) ? undefined : new Response("no", { status: 400 });
      },
      websocket: { open: (ws) => hub.open(ws), message: (ws, m) => hub.message(ws, m), close: (ws) => hub.close(ws) },
    });
    url = `ws://localhost:${server.port}/ws`;
  });
  afterAll(() => server.stop(true));

  test("welcome on connect with block and chain", async () => {
    const s = await TestSocket.open(url);
    const w = await s.next((m) => m.type === "welcome");
    expect(w).toMatchObject({ type: "welcome", block: 60, chainId: 31337 });
    s.close();
  });

  test("every bad message gets an error and the socket stays up", async () => {
    const s = await TestSocket.open(url);
    s.send("not json");
    expect(await s.next((m) => m.type === "error")).toMatchObject({ code: "bad_json" });
    s.clear();
    s.send({ type: "subscribe", topic: "user:0x123" });
    expect(await s.next((m) => m.type === "error")).toMatchObject({ code: "bad_msg" });
    s.clear();
    s.send({ type: "dance" });
    expect(await s.next((m) => m.type === "error")).toMatchObject({ code: "bad_msg" });
    s.clear();
    s.send({ type: "hello", address: "nope" });
    expect(await s.next((m) => m.type === "error")).toMatchObject({ code: "bad_msg" });
    s.clear();
    s.send({ type: "subscribe", topic: "feed:global" });
    await s.next((m) => m.type === "trade");
    s.close();
  });

  test("subscribe replays the newest 50 oldest first, a reconnect replays them again", async () => {
    let s = await TestSocket.open(url);
    s.send({ type: "subscribe", topic: "feed:global" });
    await s.next((m) => m.type === "trade" && m.item.block === 60);
    const ids = tradeIds(s.messages);
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(row(11, ALICE).id);
    expect(ids[49]).toBe(row(60, BOB).id);
    expect(s.messages.every((m) => m.type !== "trade" || m.replay)).toBe(true);
    s.close();

    // a live trade lands while the client is gone
    store.insertTrade(row(61, ALICE));
    s = await TestSocket.open(url);
    s.send({ type: "subscribe", topic: "feed:global" });
    await s.next((m) => m.type === "trade" && m.item.block === 61);
    const again = tradeIds(s.messages);
    expect(again).toHaveLength(50);
    expect(again[49]).toBe(row(61, ALICE).id);
    s.close();
  });

  test("token and user topics replay only their trades, topics are lowercased", async () => {
    const s = await TestSocket.open(url);
    const topic = `user:${BOB.toUpperCase().replace("0X", "0x")}`;
    s.send({ type: "subscribe", topic });
    await s.next((m) => m.type === "trade" && m.item.block === 60);
    const trades = s.messages.filter((m): m is Extract<ServerMsg, { type: "trade" }> => m.type === "trade");
    expect(trades).toHaveLength(30);
    expect(trades.every((m) => m.topic === topic.toLowerCase() && m.item.user.address.toLowerCase() === BOB)).toBe(true);
    expect(trades[0]!.item.marketCapMusd).toBe("0");
    s.close();
  });

  test("live trades fan out to global, token, user and each follower's following feed", async () => {
    store.setFollow(BOB, ALICE, true, Date.now(), 0);
    const follower = await TestSocket.open(url);
    const stranger = await TestSocket.open(url);
    follower.send({ type: "subscribe", topic: `feed:following:${BOB}` });
    stranger.send({ type: "subscribe", topic: `feed:following:0x3333333333333333333333333333333333333333` });
    await follower.next((m) => m.type === "trade" && m.replay);
    await Bun.sleep(50);
    follower.clear();
    stranger.clear();

    store.insertTrade(row(62, ALICE));
    const item: FeedItem = views.replay("feed:global")!.at(-1)!;
    hub.publishTrade(item, store.followers(ALICE));
    const got = await follower.next((m) => m.type === "trade");
    expect(got).toMatchObject({ type: "trade", replay: false, topic: `feed:following:${BOB}` });
    await Bun.sleep(100);
    expect(stranger.messages).toHaveLength(0);
    follower.close();
    stranger.close();
  });

  test("a socket that floods messages is closed, a normal one stays up", async () => {
    const calm = await TestSocket.open(url);
    const flood = await TestSocket.open(url);
    await flood.next((m) => m.type === "welcome");
    for (let i = 0; i < 200; i++) flood.send({ type: "unsubscribe", topic: "prices" });
    expect(await flood.closed).toBe(CLOSE_RATE_LIMIT);
    calm.send({ type: "subscribe", topic: "feed:global" });
    await calm.next((m) => m.type === "trade");
    calm.close();
  });

  test("subscriptions per socket are capped", async () => {
    const s = await TestSocket.open(url);
    for (let i = 0; i <= MAX_TOPICS; i++) {
      s.send({ type: "subscribe", topic: `user:0x${i.toString(16).padStart(40, "0")}` });
      // stay under the rate limit
      if (i % 15 === 14) await Bun.sleep(1000);
    }
    expect(await s.next((m) => m.type === "error")).toMatchObject({ code: "too_many_topics" });
    s.close();
  }, 15000);

  test("sockets per ip are capped before the upgrade, a closed socket frees its slot", () => {
    const h = new Hub({ welcome: () => ({ type: "welcome", serverTime: 0, block: 0, chainId: 31337 }), replay: () => null });
    const admitted = Array.from({ length: MAX_SOCKETS_PER_IP }, () => h.admit("9.9.9.9"));
    expect(admitted.every((d) => d !== null)).toBe(true);
    expect(h.admit("9.9.9.9")).toBeNull();
    expect(h.admit("8.8.8.8")).not.toBeNull();
    h.release(admitted[0]!);
    expect(h.admit("9.9.9.9")).not.toBeNull();
  });

  test("unsubscribe stops delivery", async () => {
    const s = await TestSocket.open(url);
    s.send({ type: "subscribe", topic: `token:${TOKEN}` });
    await s.next((m) => m.type === "trade");
    s.send({ type: "unsubscribe", topic: `token:${TOKEN}` });
    await Bun.sleep(50);
    s.clear();
    hub.publishTrade(views.replay("feed:global")!.at(-1)!, []);
    await Bun.sleep(100);
    expect(s.messages).toHaveLength(0);
    s.close();
  });
});

describe.skipIf(!CONTRACTS_READY)(`socket against anvil${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("a killed client reconnects, resubscribes and gets the real trades replayed", async () => {
    const nvda = s.dep.tokens.find((t) => t.symbol === "NVDA")!.address;
    const a = await Actor.create(s);
    await a.faucet();
    const watcher = await TestSocket.open(`ws://localhost:${s.app.port}/ws`);
    watcher.send({ type: "subscribe", topic: "feed:global" });
    await a.trade(nvda, true, 10n * 10n ** 18n);
    const live = await watcher.next((m) => m.type === "trade" && !m.replay);
    watcher.close();

    await a.trade(nvda, true, 20n * 10n ** 18n);
    const back = await TestSocket.open(`ws://localhost:${s.app.port}/ws`);
    back.send({ type: "subscribe", topic: "feed:global" });
    await back.next((m) => m.type === "trade" && m.item.musdAmount === (20n * 10n ** 18n).toString());
    const ids = tradeIds(back.messages);
    expect(ids).toHaveLength(2);
    expect(live.type === "trade" && ids[0] === live.item.id).toBe(true);
    expect(back.messages.every((m) => m.type !== "trade" || m.replay)).toBe(true);
    back.close();
  }, 60000);

  test("prices stream once per block with only what moved", async () => {
    const tsla = s.dep.tokens.find((t) => t.symbol === "TSLA")!.address;
    const sock = await TestSocket.open(`ws://localhost:${s.app.port}/ws`);
    sock.send({ type: "subscribe", topic: "prices" });
    await Bun.sleep(100);
    const a = await Actor.create(s);
    await a.faucet();
    await a.trade(tsla, true, 50n * 10n ** 18n);
    const m = await sock.next((x) => x.type === "prices" && x.prices.some((p) => p.address === tsla));
    expect(m.type === "prices" && m.prices.length).toBe(1);
    sock.close();
  }, 60000);
});

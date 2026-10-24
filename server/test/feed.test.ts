import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { followMessage, type FeedItem } from "shared";
import { WAD } from "../src/pricing";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, get, post } from "./helpers/actors";

describe.skipIf(!CONTRACTS_READY)(`feed${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("every trade reaches the global feed within a block, the following feed only has followed traders", async () => {
    const googl = s.dep.tokens.find((t) => t.symbol === "GOOGL")!.address;
    const [me, followed, other] = await Promise.all([Actor.create(s), Actor.create(s), Actor.create(s)]);
    await Promise.all([followed.faucet(), other.faucet()]);
    const issued = new Date().toISOString();
    const f = await post(s.app.url, "/follow", { address: me.address, target: followed.address, follow: true, issued, sig: await me.account.signMessage({ message: followMessage(followed.address, true, issued) }) });
    expect(f.status).toBe(200);

    me.socket.send({ type: "subscribe", topic: "feed:global" });
    me.socket.send({ type: "subscribe", topic: `feed:following:${me.address}` });
    await Bun.sleep(100);

    await followed.trade(googl, true, 30n * WAD);
    await other.trade(googl, true, 40n * WAD);
    const g = await me.socket.next((m) => m.type === "trade" && m.topic === "feed:global" && m.item.user.address === other.address);
    expect(g.type === "trade" && g.item).toMatchObject({ isBuy: true, musdAmount: (40n * WAD).toString(), token: { symbol: "GOOGL" } });
    await me.socket.next((m) => m.type === "trade" && m.topic.startsWith("feed:following") && m.item.user.address === followed.address);
    const following = me.socket.messages.filter((m) => m.type === "trade" && m.topic.startsWith("feed:following"));
    expect(following.every((m) => m.type === "trade" && m.item.user.address === followed.address)).toBe(true);

    const http = (await get<FeedItem[]>(s.app.url, `/feed?scope=following&address=${me.address}`)).body;
    expect(http.map((i) => i.user.address)).toEqual([followed.address]);
    const global = (await get<FeedItem[]>(s.app.url, "/feed")).body;
    expect(global.slice(0, 2).map((i) => i.user.address)).toEqual([other.address, followed.address]);
    expect((await get<{ code: string }>(s.app.url, "/feed?scope=following")).status).toBe(400);
  }, 60000);

  test("re-indexing the same blocks never duplicates a trade", async () => {
    const before = (await get<FeedItem[]>(s.app.url, "/feed")).body.length;
    s.app.store.setMeta("last_block", String(s.dep.startBlock - 1));
    const a = await Actor.create(s);
    await a.faucet();
    const after = (await get<FeedItem[]>(s.app.url, "/feed")).body;
    expect(after.length).toBe(before);
    expect(new Set(after.map((i) => i.id)).size).toBe(after.length);
  }, 60000);
});

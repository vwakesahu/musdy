import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TokenInfo } from "shared";
import { PriceBook } from "../src/price-book";
import { WAD } from "../src/pricing";
import { Views } from "../src/views";
import { CONTRACTS_READY, SKIP_NOTE, startStack, type Stack } from "./helpers/anvil";
import { Actor, get } from "./helpers/actors";

describe.skipIf(!CONTRACTS_READY)(`launch and graduation${SKIP_NOTE}`, () => {
  let s: Stack;
  beforeAll(async () => {
    s = await startStack();
  }, 120000);
  afterAll(async () => s && (await s.stop()));

  test("a coin that sells out its curve graduates into a pool and keeps trading", async () => {
    const actors = await Promise.all([0, 1, 2, 3, 4].map(() => Actor.create(s)));
    await Promise.all(actors.map((a) => a.faucet()));
    const [creator, ...buyers] = actors as [Actor, ...Actor[]];
    creator.socket.send({ type: "subscribe", topic: "tokens" });
    await creator.submit("/actions/launch", await creator.launchBody("Graduate", "GRAD", 900n * WAD));
    const coin = (await get<TokenInfo[]>(s.app.url, "/tokens?sort=new")).body.find((t) => t.symbol === "GRAD")!;
    for (const b of buyers) await b.trade(coin.address, true, 950n * WAD);

    const info = (await get<TokenInfo>(s.app.url, `/tokens/${coin.address}`)).body;
    expect(info.venue).toBe("pool");
    expect(info.curveProgress).toBeNull();
    expect(info.pool).not.toBeNull();
    const grad = await creator.socket.next((m) => m.type === "token" && m.token.symbol === "GRAD" && m.token.venue === "pool");
    expect(grad.type).toBe("token");

    const last = buyers.at(-1)!;
    expect((await last.vaultBalance(s.dep.musd)) > 50n * WAD).toBe(true);

    const held = await creator.vaultBalance(coin.address);
    await creator.trade(coin.address, false, held / 10n);
    const sold = (await get<TokenInfo>(s.app.url, `/tokens/${coin.address}`)).body;
    expect(BigInt(sold.priceMusd) < BigInt(info.priceMusd)).toBe(true);
    await creator.submit("/actions/withdraw", await creator.withdrawBody(coin.address, held / 10n, creator.address));
    expect(await creator.walletBalance(coin.address)).toBe(held / 10n);

    const store = s.app.store;
    const views = new Views(store, new PriceBook(store), s.dep.musd.toLowerCase(), 0n, () => s.app.block());
    const key = (p: { user: string; token: string }) => `${p.user}:${p.token}`;
    const sorted = <T extends { user: string; token: string }>(xs: T[]) => [...xs].sort((x, y) => key(x).localeCompare(key(y)));
    const kept = sorted(store.allPositions());
    expect(kept.filter((p) => p.token === coin.address.toLowerCase())).toHaveLength(5);
    expect(kept).toEqual(sorted(views.recomputePositions()));
  }, 90000);
});

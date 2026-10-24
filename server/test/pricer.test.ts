import { describe, expect, test } from "bun:test";
import { zeroAddress, type Chain, type PublicClient, type Transport } from "viem";
import type { Deployment } from "shared";
import { openDb } from "../src/db";
import { PriceBook } from "../src/price-book";
import { POOL_RECHECK_BLOCKS, Pricer } from "../src/pricer";
import { Store } from "../src/store";
import { Views } from "../src/views";
import { tempDb } from "./helpers/anvil";

const TOKEN = "0x00000000000000000000000000000000000000aa";
const MUSD = "0x00000000000000000000000000000000000000bb";

describe("pricer", () => {
  test("a token without a pool is looked up again only every few blocks or after a poke", async () => {
    const store = new Store(openDb(tempDb()));
    store.seedToken({ address: TOKEN, symbol: "TKN", name: "Token", decimals: 18, kind: "other", createdAt: 0 });
    const book = new PriceBook(store);
    const views = new Views(store, book, MUSD, 1n, () => 0);
    let getPool = 0;
    const pub = {
      chain: { contracts: {} },
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "getPool") getPool++;
        return zeroAddress;
      },
    } as unknown as PublicClient<Transport, Chain>;
    const dep = { factory: "0x00000000000000000000000000000000000000cc", musd: MUSD } as unknown as Deployment;
    const pricer = new Pricer(pub, store, book, views, dep);

    await pricer.tick(1, 1);
    expect(getPool).toBe(2);
    for (let b = 2; b < 1 + POOL_RECHECK_BLOCKS; b++) await pricer.tick(b, b);
    expect(getPool).toBe(2);
    await pricer.tick(1 + POOL_RECHECK_BLOCKS, 100);
    expect(getPool).toBe(4);
    pricer.poke(TOKEN.toUpperCase().replace("0X", "0x"));
    await pricer.tick(2 + POOL_RECHECK_BLOCKS, 101);
    expect(getPool).toBe(6);
    await pricer.tick(3 + POOL_RECHECK_BLOCKS, 102);
    expect(getPool).toBe(6);
  });

  test("picks the deeper MUSD side between volatile and stable, ignores empty pools, and follows liquidity on re-lookup", async () => {
    const store = new Store(openDb(tempDb()));
    store.seedToken({ address: TOKEN, symbol: "TKN", name: "Token", decimals: 18, kind: "stock", createdAt: 0 });
    const book = new PriceBook(store);
    const views = new Views(store, book, MUSD, 1n, () => 0);
    const VOL = "0x00000000000000000000000000000000000000a1";
    const STA = "0x00000000000000000000000000000000000000a2";
    const W = 10n ** 18n;
    const t0: Record<string, string> = { [VOL]: MUSD, [STA]: TOKEN };
    const res: Record<string, [bigint, bigint]> = { [VOL]: [1n, 1n], [STA]: [0n, 0n] };
    const pub = {
      chain: { contracts: {} },
      readContract: async ({ address, functionName, args }: { address: string; functionName: string; args?: unknown[] }) => {
        if (functionName === "getPool") return args![2] ? STA : VOL;
        if (functionName === "token0") return t0[address.toLowerCase()];
        if (functionName === "getReserves") return [...res[address.toLowerCase()]!, 0n];
        throw new Error(functionName);
      },
    } as unknown as PublicClient<Transport, Chain>;
    const dep = { factory: "0x00000000000000000000000000000000000000cc", musd: MUSD } as unknown as Deployment;
    const pricer = new Pricer(pub, store, book, views, dep);

    await pricer.tick(1, 1);
    expect(store.token(TOKEN)!.pool).toBe(VOL);
    res[STA] = [0n, 1000n * W];
    pricer.poke(TOKEN);
    await pricer.tick(2, 2);
    expect(store.token(TOKEN)!.pool).toBe(VOL);
    res[STA] = [10n * W, 1000n * W];
    pricer.poke(TOKEN);
    await pricer.tick(3, 3);
    expect(store.token(TOKEN)!.pool).toBe(STA);
    expect(book.latest(TOKEN)).toBe(100n * W);
    res[VOL] = [5000n * W, 10n * W];
    await pricer.tick(4, 4);
    expect(store.token(TOKEN)!.pool).toBe(STA);
    await pricer.tick(3 + POOL_RECHECK_BLOCKS, 5);
    expect(store.token(TOKEN)!.pool).toBe(VOL);
    expect(book.latest(TOKEN)).toBe(500n * W);
    res[STA] = [10n * W, 5000n * W];
    pricer.poke(TOKEN);
    await pricer.tick(4 + POOL_RECHECK_BLOCKS, 6);
    expect(store.token(TOKEN)!.pool).toBe(VOL);
    res[VOL] = [5000n * W, 0n];
    await pricer.tick(5 + POOL_RECHECK_BLOCKS, 7);
    expect(book.latest(TOKEN)).toBe(500n * W);
  });
});

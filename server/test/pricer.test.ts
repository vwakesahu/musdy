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
    // no multicall on this chain, so every read goes through readContract
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
    expect(getPool).toBe(2); // volatile and stable
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
});

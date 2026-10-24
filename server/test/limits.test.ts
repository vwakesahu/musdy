import { describe, expect, test } from "bun:test";
import type { Chain, PublicClient, Transport } from "viem";
import type { Deployment, FeedItem, ServerMsg } from "shared";
import { BlockLoop } from "../src/blocks";
import { openDb } from "../src/db";
import { clientIp, handleHttp, param, qUint, type Handlers } from "../src/http";
import { CONN_BURST, HELLO_ADDRS_PER_MIN, Hub, type Ws } from "../src/hub";
import { Store } from "../src/store";
import { Watcher } from "../src/watcher";
import { tempDb } from "./helpers/anvil";

const addr = (i: number) => `0x${(i + 1).toString(16).padStart(40, "0")}`;
const dep = {
  musd: "0x00000000000000000000000000000000000000bb",
  btc: "0x00000000000000000000000000000000000000cc",
  vault: "0x00000000000000000000000000000000000000dd",
} as unknown as Deployment;

const rig = (hubOpts: Partial<ConstructorParameters<typeof Hub>[0]> = {}) => {
  let reads = 0;
  let now = 1_000_000;
  const block = 7;
  const pub = {
    chain: { contracts: {} },
    readContract: async () => {
      reads++;
      return 0n;
    },
  } as unknown as PublicClient<Transport, Chain>;
  const pushes: Promise<void>[] = [];
  const hub: Hub = new Hub({
    welcome: () => ({ type: "welcome", serverTime: 0, block, chainId: 31337 }),
    replay: () => null,
    onHello: (a) => void pushes.push(watcher.push(a, true)),
    now: () => now,
    ...hubOpts,
  });
  const watcher = new Watcher(pub, new Store(openDb(tempDb())), hub, dep, () => block);
  const connect = (ip: string, address: string): ServerMsg[] | null => {
    const data = hub.admit(ip);
    if (!data) return null;
    const sent: ServerMsg[] = [];
    const ws = { data, send: (f: string) => void sent.push(JSON.parse(f) as ServerMsg), close: () => {} } as unknown as Ws;
    hub.open(ws);
    hub.message(ws, JSON.stringify({ type: "hello", address }));
    hub.close(ws);
    return sent;
  };
  return {
    hub,
    connect,
    reads: () => reads,
    settle: () => Promise.all(pushes.splice(0)),
    tick: (ms: number) => (now += ms),
  };
};

const READS_PER_SNAPSHOT = 3;

describe("socket abuse limits", () => {
  test("a reconnect loop with fresh addresses is capped by the upgrade bucket and the per ip hello cap", async () => {
    const r = rig();
    let refused = 0;
    for (let i = 0; i < 5000; i++) if (r.connect("6.6.6.6", addr(i)) === null) refused++;
    await r.settle();
    expect(refused).toBe(5000 - CONN_BURST);
    expect(r.reads()).toBeLessThanOrEqual(Math.min(CONN_BURST, HELLO_ADDRS_PER_MIN) * READS_PER_SNAPSHOT);
    expect(r.connect("5.5.5.5", addr(1))).not.toBeNull();
  });

  test("with the upgrade bucket out of the way, one ip still gets only so many distinct hello addresses a minute", async () => {
    const r = rig({ connBurst: 1e9 });
    const errors: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const sent = r.connect("6.6.6.6", addr(i))!;
      for (const m of sent) if (m.type === "error") errors.push(m.code);
    }
    await r.settle();
    expect(errors).toHaveLength(1000 - HELLO_ADDRS_PER_MIN);
    expect(errors.every((c) => c === "too_many_hellos")).toBe(true);
    expect(r.reads()).toBe(HELLO_ADDRS_PER_MIN * READS_PER_SNAPSHOT);
    expect(r.connect("6.6.6.6", addr(0))!.some((m) => m.type === "error")).toBe(false);
    expect(r.connect("6.6.6.6", addr(5000))!.some((m) => m.type === "error")).toBe(true);
    r.tick(60_000);
    expect(r.connect("6.6.6.6", addr(5000))!.some((m) => m.type === "error")).toBe(false);
  });

  test("the same address said hello with over and over in one block costs one balance read", async () => {
    const r = rig({ connBurst: 1e9 });
    for (let i = 0; i < 2000; i++) r.connect(`10.0.${i % 200}.1`, addr(42));
    await r.settle();
    expect(r.reads()).toBe(READS_PER_SNAPSHOT);
  });

  test("upgrades refill at the bucket rate", () => {
    const r = rig();
    for (let i = 0; i < CONN_BURST; i++) expect(r.connect("4.4.4.4", addr(0))).not.toBeNull();
    expect(r.connect("4.4.4.4", addr(0))).toBeNull();
    r.tick(2000);
    expect(r.connect("4.4.4.4", addr(0))).not.toBeNull();
    expect(r.connect("4.4.4.4", addr(0))).toBeNull();
  });
});

describe("client ip behind a proxy", () => {
  const req = (xff?: string) => new Request("http://x/health", { headers: xff ? { "x-forwarded-for": xff } : {} });
  test("TRUST_PROXY takes the rightmost x-forwarded-for entry, the one our proxy appended", () => {
    expect(clientIp(req("1.2.3.4, 9.9.9.9"), "127.0.0.1", true)).toBe("9.9.9.9");
    expect(clientIp(req("spoofed, also-spoofed,  8.8.8.8 "), "127.0.0.1", true)).toBe("8.8.8.8");
    expect(clientIp(req("7.7.7.7"), "127.0.0.1", true)).toBe("7.7.7.7");
    expect(clientIp(req(), "127.0.0.1", true)).toBe("127.0.0.1");
  });
  test("without TRUST_PROXY the header is ignored", () => {
    expect(clientIp(req("1.2.3.4, 9.9.9.9"), "127.0.0.1", false)).toBe("127.0.0.1");
  });
});

describe("oversized numbers", () => {
  test("a query uint that does not fit uint256 is a 400, never reaches the chain", async () => {
    const huge = "9".repeat(78);
    expect(() => param(qUint, huge, "amountIn")).toThrow("uint256");
    expect(() => param(qUint, "1".repeat(79), "amountIn")).toThrow();
    expect(param(qUint, (2n ** 256n - 1n).toString(), "amountIn")).toBe(2n ** 256n - 1n);
    let called = false;
    const handlers = {
      quote: ({ query }: { query: URLSearchParams }) => {
        param(qUint, query.get("amountIn"), "amountIn");
        called = true;
        return {};
      },
    } as unknown as Handlers;
    const res = await handleHttp(new Request(`http://x/quote?amountIn=${huge}`), handlers);
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe("block loop", () => {
  const item = (n: number) => ({ id: String(n) }) as unknown as FeedItem;

  test("a slow balance watcher never delays indexing, so a trade reaches the feed at once, one watcher pass at a time", async () => {
    const feed: FeedItem[] = [];
    let watchCalls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    let release: () => void = () => {};
    const loop = new BlockLoop(
      {
        index: async (n) => void feed.push(item(n)),
        price: async () => {},
        watch: () => {
          watchCalls++;
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise<void>((resolve) => {
            release = () => {
              inFlight--;
              resolve();
            };
          });
        },
      },
      1,
    );
    await loop.waitFor(1, 500);
    expect(watchCalls).toBe(1);
    for (let n = 2; n <= 5; n++) {
      const t0 = Date.now();
      await loop.waitFor(n, 500);
      expect(Date.now() - t0).toBeLessThan(100);
      expect(feed.at(-1)!.id).toBe(String(n));
    }
    expect(watchCalls).toBe(1);
    release();
    await Bun.sleep(10);
    expect(watchCalls).toBe(2);
    release();
    await loop.watcherIdle();
    expect(watchCalls).toBe(2);
    expect(maxInFlight).toBe(1);
  });

  test("a failing watcher pass is logged and the next block still runs one", async () => {
    let calls = 0;
    const loop = new BlockLoop(
      {
        index: async () => {},
        price: async () => {},
        watch: async () => {
          calls++;
          throw new Error("rpc down");
        },
      },
      1,
    );
    await loop.waitFor(1, 500);
    await loop.watcherIdle();
    await loop.waitFor(2, 500);
    await loop.watcherIdle();
    expect(calls).toBe(2);
  });
});

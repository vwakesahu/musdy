import { erc20Abi, type Address } from "viem";
import { z } from "zod";
import { launchpadAbi, vaultAbi, type Deployment, type Health } from "shared";
import { applyFollow, applyProfile } from "./auth";
import { buildCandles, TF_SECONDS, type Tf } from "./candles";
import { makeClients } from "./chain";
import { openDb } from "./db";
import { deploymentFor, faucetEnabled, type Env } from "./env";
import { HttpError, simulationError } from "./errors";
import { handleHttp, param, qAddress, qBool, qOptional, qUint, type Handlers } from "./http";
import { Hub, type WsData } from "./hub";
import { Indexer } from "./indexer";
import { errMessage, log } from "./log";
import { PriceBook } from "./price-book";
import { Pricer } from "./pricer";
import { readMany } from "./reads";
import { Relayer } from "./relayer";
import { Sender } from "./sender";
import { Store } from "./store";
import { Views } from "./views";
import { Watcher } from "./watcher";

export interface App {
  port: number;
  url: string;
  store: Store;
  block(): number;
  // resolves once every block up to `n` is indexed, priced and pushed
  waitForBlock(n: number, timeoutMs?: number): Promise<void>;
  stop(): Promise<void>;
}

const CANDLE_COUNT = 500;

export const startApp = async (env: Env, deployment?: Deployment): Promise<App> => {
  const dep = deployment ?? deploymentFor(env.CHAIN_ID);
  if (dep.chainId !== env.CHAIN_ID) throw new Error(`deployment is for chain ${dep.chainId}, CHAIN_ID is ${env.CHAIN_ID}`);
  const clients = makeClients(env);
  const { pub } = clients;
  const store = new Store(openDb(env.DB_PATH));
  const book = new PriceBook(store);
  const musd = dep.musd.toLowerCase();

  const [curveSupply, launchSupply] = await Promise.all([
    pub.readContract({ address: dep.launchpad, abi: launchpadAbi, functionName: "CURVE_SUPPLY" }),
    pub.readContract({ address: dep.launchpad, abi: launchpadAbi, functionName: "TOTAL_SUPPLY" }),
  ]);
  const seededAt = Math.floor(Date.now() / 1000);
  for (const t of dep.tokens) store.seedToken({ ...t, createdAt: seededAt });
  const supplies = await readMany<bigint>(pub, dep.tokens.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "totalSupply" }) as const));
  dep.tokens.forEach((t, i) => {
    const s = supplies[i];
    if (s !== null && s !== undefined) store.setSupply(t.address, s);
  });

  let current = Number(await pub.getBlockNumber());
  const views = new Views(store, book, musd, curveSupply, () => current);

  const hub: Hub = new Hub({
    welcome: () => ({ type: "welcome", serverTime: Date.now(), block: current, chainId: env.CHAIN_ID }),
    replay: (topic) => views.replay(topic),
    onHello: (addr) => void watcher.push(addr, true).catch((e) => log("watcher.error", { address: addr, error: errMessage(e) })),
    onSubscribe: (topic) => {
      if (!topic.startsWith("user:")) return;
      const addr = topic.slice(5);
      void watcher.push(addr, true).catch((e) => log("watcher.error", { address: addr, error: errMessage(e) }));
    },
  });
  const watcher = new Watcher(pub, store, hub, dep, () => current);
  const publishToken = (address: string) => {
    const token = views.token(address);
    if (token) hub.publish("tokens", (topic) => ({ type: "token", topic, token }));
  };
  const indexer = new Indexer({
    pub,
    store,
    book,
    dep,
    launchTotalSupply: launchSupply,
    onTrade: (row) => hub.publishTrade(views.feedItem(row), store.followers(row.user)),
    onToken: publishToken,
  });
  const pricer = new Pricer(pub, store, book, views, dep);

  const relayerSender = new Sender(clients.relayer, pub, "relayer");
  const faucetSender = clients.faucet && faucetEnabled(env) ? new Sender(clients.faucet, pub, "faucet") : null;
  const relayer = new Relayer({ pub, relayer: relayerSender, faucet: faucetSender, dep, chainId: env.CHAIN_ID, hub, store });

  log("indexer.backfill_start", { from: indexer.lastBlock() + 1, to: current });
  await indexer.syncTo(current);
  log("indexer.backfill_done", { block: current });

  // block loop. runs strictly one at a time, always catching up to the newest head
  let wanted = current;
  let running = false;
  // the head itself still needs its first price and balance round
  let done = current - 1;
  const waiters: { n: number; resolve: () => void }[] = [];
  const runBlocks = async () => {
    if (running) return;
    running = true;
    try {
      while (done < wanted) {
        const target = wanted;
        await indexer.syncTo(target);
        current = target;
        const block = await pub.getBlock({ blockNumber: BigInt(target) });
        const moves = await pricer.tick(target, Number(block.timestamp));
        if (moves.length) hub.publish("prices", (topic) => ({ type: "prices", topic, block: target, prices: moves }));
        await watcher.tick();
        done = target;
        for (const w of waiters.splice(0)) {
          if (w.n <= done) w.resolve();
          else waiters.push(w);
        }
      }
    } catch (e) {
      log("block.error", { wanted, done, error: errMessage(e) });
    } finally {
      running = false;
    }
  };
  const unwatch = clients.watch.watchBlockNumber({
    emitOnBegin: true,
    pollingInterval: 1000,
    onBlockNumber: (n) => {
      wanted = Math.max(wanted, Number(n));
      void runBlocks();
    },
    onError: (e) => log("block.watch_error", { error: errMessage(e) }),
  });
  // a failed round is retried on the next head, this also covers a quiet chain
  const retry = setInterval(() => {
    if (done < wanted) void runBlocks();
  }, 2000);

  const handlers: Handlers = {
    health: async (): Promise<Health> => ({
      ok: true,
      block: current,
      chainId: env.CHAIN_ID,
      relayer: relayerSender.address,
      relayerBtc: (await pub.getBalance({ address: relayerSender.address })).toString(),
    }),
    config: () => dep,
    tokens: ({ query }) => views.tokens(param(z.enum(["trending", "new", "stocks"]).default("trending"), query.get("sort"), "sort")),
    token: ({ params }) => {
      const t = views.token(param(qAddress, params.address, "address"));
      if (!t) throw new HttpError(404, "not_found", "unknown token");
      return t;
    },
    candles: ({ params, query }) => {
      const token = param(qAddress, params.address, "address");
      const tf: Tf = param(z.enum(["1m", "5m", "1h", "1d"]).default("1m"), query.get("tf"), "tf");
      const since = Math.floor(Date.now() / 1000) - TF_SECONDS[tf] * CANDLE_COUNT;
      return buildCandles(store.tokenTicks(token, since).map((r) => ({ ts: r.ts, price: r.price_f, volume: r.musd_f })), tf);
    },
    tokenTrades: ({ params, query }) =>
      views.feed(store.tokenTrades(param(qAddress, params.address, "address"), param(qOptional, query.get("before"), "before"))),
    feed: ({ query }) => {
      const scope = param(z.enum(["global", "following"]).default("global"), query.get("scope"), "scope");
      const before = param(qOptional, query.get("before"), "before");
      if (scope === "global") return views.feed(store.globalTrades(before));
      return views.feed(store.followingTrades(param(qAddress, query.get("address"), "address"), before));
    },
    user: async ({ params, query }) => {
      const user = param(qAddress, params.address, "address");
      const viewer = param(qAddress.optional(), query.get("viewer"), "viewer") ?? null;
      const cash = await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [user, dep.musd] });
      return views.profile(user, cash, viewer);
    },
    userTrades: ({ params, query }) =>
      views.feed(store.userTrades(param(qAddress, params.address, "address"), param(qOptional, query.get("before"), "before"))),
    leaderboard: ({ query }) => views.leaderboard(param(z.enum(["d1", "d7", "all"]).default("d1"), query.get("window"), "window")),
    quote: async ({ query }) => {
      const token = param(qAddress, query.get("token"), "token");
      const isBuy = param(qBool, query.get("isBuy"), "isBuy");
      const amountIn = BigInt(param(qUint, query.get("amountIn"), "amountIn"));
      let res: readonly [bigint, bigint];
      let onCurve: boolean;
      try {
        [res, onCurve] = await Promise.all([
          pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "quote", args: [token, isBuy, amountIn] }),
          pub.readContract({ address: dep.launchpad, abi: launchpadAbi, functionName: "isCurve", args: [token] }),
        ]);
      } catch (e) {
        throw simulationError(e);
      }
      const [amountOut, fee] = res;
      const row = store.token(token);
      const price = row ? views.priceOf(row) : 0n;
      const unit = 10n ** BigInt(row?.decimals ?? 18);
      let impact = 0;
      if (price > 0n) {
        const expected = isBuy ? ((amountIn - fee) * unit) / price : (amountIn * price) / unit;
        const got = isBuy ? amountOut : amountOut + fee;
        if (expected > 0n && got < expected) impact = Number(((expected - got) * 1_000_000n) / expected) / 1_000_000;
      }
      return { amountOut: amountOut.toString(), fee: fee.toString(), priceImpact: impact, venue: onCurve ? "curve" : "pool" };
    },
    nonce: async ({ params }) => {
      const user = param(qAddress, params.address, "address");
      const n = await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "nonces", args: [user] });
      return { nonce: n.toString() };
    },
    trade: ({ body }) => relayer.trade(body),
    withdraw: ({ body }) => relayer.withdraw(body),
    launch: ({ body }) => relayer.launch(body),
    deposit: ({ body }) => relayer.deposit(body),
    faucet: ({ body }) => relayer.faucet(body),
    profile: async ({ body }) => {
      const user: Address = await applyProfile(store, body);
      const cash = await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "balanceOf", args: [user, dep.musd] });
      return views.profile(user, cash);
    },
    follow: async ({ body }) => {
      await applyFollow(store, body);
      return { ok: true };
    },
  };

  const server = Bun.serve<WsData>({
    port: env.PORT,
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/ws") {
        if (srv.upgrade(req, { data: hub.newData() })) return undefined;
        return new Response("websocket upgrade failed", { status: 400 });
      }
      return handleHttp(req, handlers);
    },
    websocket: {
      open: (ws) => hub.open(ws),
      message: (ws, raw) => hub.message(ws, raw),
      close: (ws) => hub.close(ws),
    },
  });
  const port = server.port ?? env.PORT;
  log("server.start", { port, chainId: env.CHAIN_ID, block: current, faucet: !!faucetSender, relayer: relayerSender.address });

  return {
    port,
    url: `http://localhost:${port}`,
    store,
    block: () => done,
    waitForBlock: (n, timeoutMs = 15000) =>
      new Promise<void>((resolve, reject) => {
        if (done >= n) return resolve();
        const timer = setTimeout(() => reject(new Error(`block ${n} not processed, at ${done}`)), timeoutMs);
        waiters.push({ n, resolve: () => (clearTimeout(timer), resolve()) });
        wanted = Math.max(wanted, n);
        void runBlocks();
      }),
    stop: async () => {
      unwatch();
      clearInterval(retry);
      await clients.close();
      await server.stop(true);
      store.db.close();
      log("server.stop", { port });
    },
  };
};

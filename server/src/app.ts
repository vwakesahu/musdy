import { erc20Abi, type Address } from "viem";
import { FeedScope, launchpadAbi, PnlWindow, tokenLogo, vaultAbi, type Deployment, type Health } from "shared";
import { applyFollow, applyProfile } from "./auth";
import { BlockLoop } from "./blocks";
import { makeClients } from "./chain";
import { openDb } from "./db";
import { deploymentFor, faucetEnabled, type Env } from "./env";
import { simulationError } from "./errors";
import { clientIp, handleHttp, param, qAddress, qBool, qOptional, qUint, type Handlers } from "./http";
import { Hub, type WsData } from "./hub";
import { Indexer } from "./indexer";
import { Market } from "./market/market";
import { marketRoutes } from "./market/routes";
import { errMessage, log } from "./log";
import { PriceBook } from "./price-book";
import { Pricer } from "./pricer";
import { readMany } from "./reads";
import { FAUCET_AMOUNT, Relayer } from "./relayer";
import { Sender, type SenderOpts } from "./sender";
import { makeSolver, type SolverOpts } from "./solver";
import { Store, type Venue } from "./store";
import { Views } from "./views";
import { Watcher } from "./watcher";

export interface App {
  port: number;
  url: string;
  store: Store;
  block(): number;
  waitForBlock(n: number, timeoutMs?: number): Promise<void>;
  stop(): Promise<void>;
}

export interface AppOpts {
  sender?: SenderOpts;
  solver?: SolverOpts;
}

export const startApp = async (env: Env, deployment?: Deployment, opts: AppOpts = {}): Promise<App> => {
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
  for (const t of dep.tokens) store.seedToken({ ...t, image: tokenLogo(t.symbol) ?? null, createdAt: seededAt });
  const supplies = await readMany<bigint>(pub, dep.tokens.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "totalSupply" }) as const));
  dep.tokens.forEach((t, i) => {
    const s = supplies[i];
    if (s !== null && s !== undefined) store.setSupply(t.address, s);
  });

  let current = Number(await pub.getBlockNumber());
  const views = new Views(store, book, musd, curveSupply, () => current, dep.chainId);
  if (store.getMeta("positions_built") !== "1") {
    views.rebuildPositions();
    store.setMeta("positions_built", "1");
  }

  const hub: Hub = new Hub({
    welcome: () => ({ type: "welcome", serverTime: Date.now(), block: current, chainId: env.CHAIN_ID }),
    replay: (topic) => views.replay(topic),
    onHello: (addr) => void watcher.push(addr, true).catch((e) => log("watcher.error", { address: addr, error: errMessage(e) })),
    // only a socket's own user topic gets an immediate balance push, any other user topic waits for the next change
    onSubscribe: (topic, address) => {
      if (!address || topic !== `user:${address}`) return;
      void watcher.push(address, true).catch((e) => log("watcher.error", { address, error: errMessage(e) }));
    },
  });
  const watcher = new Watcher(pub, store, hub, dep, () => current, {
    get: (a) => kit?.external?.get(a) ?? [],
    touch: (a) => kit?.external?.touch(a),
  });
  const publishToken = (address: string) => {
    const token = views.token(address);
    if (token) hub.publish("tokens", (topic) => ({ type: "token", topic, token }));
  };
  const market = env.MARKET ? new Market({ onPrices: (prices) => hub.publish("prices", (topic) => ({ type: "prices", topic, block: current, prices })) }) : null;
  market?.start();
  if (market) views.marketCoin = (r) => market.cached(r);
  const memeRoutes = marketRoutes(market, views, store, dep.chainId);
  const pricer = new Pricer(pub, store, book, views, dep);
  const indexer = new Indexer({
    pub,
    store,
    book,
    dep,
    launchTotalSupply: launchSupply,
    onTrade: (row) => {
      if (row.venue === "pool") pricer.poke(row.token);
      hub.publishTrade(views.feedItem(row), store.followers(row.user));
    },
    onToken: (address) => {
      pricer.poke(address);
      publishToken(address);
    },
    onIntent: (ev) => kit.onIntent(ev),
    valueAt: views.value,
  });

  const relayerSender = new Sender(clients.relayer, pub, "relayer", opts.sender);
  const faucetSender = clients.faucet && faucetEnabled(env) ? new Sender(clients.faucet, pub, "faucet", opts.sender) : null;
  relayerSender.start();
  faucetSender?.start();
  const relayer: Relayer = new Relayer({ pub, relayer: relayerSender, faucet: faucetSender, dep, chainId: env.CHAIN_ID, hub, store, faucetHourlyCap: env.FAUCET_HOURLY_CAP });

  const kit = makeSolver(env, {
      pub,
      chain: clients.chain,
      rpcUrl: env.RPC_URL,
      dep,
      store,
      views,
      book,
      hub,
      relayer,
      onExternal: (a) => void watcher.push(a, false).catch((e) => log("watcher.error", { address: a, error: errMessage(e) })),
    }, { ...opts.solver, sender: opts.sender });
  await kit.start();

  log("indexer.backfill_start", { from: indexer.lastBlock() + 1, to: current });
  await indexer.syncTo(current);
  log("indexer.backfill_done", { block: current });

  const loop = new BlockLoop(
    {
      index: async (target) => {
        await indexer.syncTo(target);
        current = target;
      },
      price: async (target) => {
        const block = await pub.getBlock({ blockNumber: BigInt(target) });
        const moves = await pricer.tick(target, Number(block.timestamp));
        if (moves.length) hub.publish("prices", (topic) => ({ type: "prices", topic, block: target, prices: moves.map((m) => ({ ...m, chainId: env.CHAIN_ID })) }));
      },
      watch: () => watcher.tick(),
    },
    current,
  );
  const unwatch = clients.watch.watchBlockNumber({
    emitOnBegin: true,
    pollingInterval: 1000,
    onBlockNumber: (n) => loop.want(Number(n)),
    onError: (e) => log("block.watch_error", { error: errMessage(e) }),
  });
  const retry = setInterval(() => {
    if (loop.behind()) void loop.run();
  }, 2000);

  const handlers: Handlers = {
    health: async (): Promise<Health> => ({
      ok: true,
      block: current,
      chainId: env.CHAIN_ID,
      faucetAmount: FAUCET_AMOUNT.toString(),
      relayer: relayerSender.address,
      relayerBtc: (await pub.getBalance({ address: relayerSender.address })).toString(),
      faucet: !!faucetSender,
    }),
    config: () => dep,
    tokens: memeRoutes.tokens,
    token: memeRoutes.token,
    candles: memeRoutes.candles,
    tokenTrades: ({ params, query }) =>
      views.feed(store.tokenTrades(param(qAddress, params.address, "address"), param(qOptional, query.get("before"), "before"))),
    feed: ({ query }) => {
      const scope = param(FeedScope.default("global"), query.get("scope"), "scope");
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
    leaderboard: ({ query }) => views.leaderboard(param(PnlWindow.default("d1"), query.get("window"), "window")),
    quote: async ({ query }) => {
      const token = param(qAddress, query.get("token"), "token");
      const isBuy = param(qBool, query.get("isBuy"), "isBuy");
      const amountIn = param(qUint, query.get("amountIn"), "amountIn");
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
      return { amountOut: amountOut.toString(), fee: fee.toString(), priceImpact: impact, venue: (onCurve ? "curve" : "pool") satisfies Venue };
    },
    nonce: async ({ params }) => {
      const user = param(qAddress, params.address, "address");
      const n = await pub.readContract({ address: dep.vault, abi: vaultAbi, functionName: "nonces", args: [user] });
      return { nonce: n.toString() };
    },
    ...kit.handlers,
    trade: ({ body }) => relayer.trade(body),
    withdraw: ({ body }) => relayer.withdraw(body),
    launch: ({ body }) => relayer.launch(body),
    deposit: ({ body }) => relayer.deposit(body),
    faucet: ({ body, ip }) => relayer.faucet(body, ip),
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
      const ip = clientIp(req, srv.requestIP(req)?.address, env.TRUST_PROXY);
      if (new URL(req.url).pathname === "/ws") {
        const data = hub.admit(ip);
        if (!data) return new Response("too many sockets or reconnects from this address", { status: 429 });
        if (srv.upgrade(req, { data })) return undefined;
        hub.release(data);
        return new Response("websocket upgrade failed", { status: 400 });
      }
      return handleHttp(req, handlers, ip);
    },
    websocket: {
      maxPayloadLength: 16 * 1024,
      backpressureLimit: 1024 * 1024,
      closeOnBackpressureLimit: true,
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
    block: () => loop.processed,
    waitForBlock: (n, timeoutMs) => loop.waitFor(n, timeoutMs),
    stop: async () => {
      unwatch();
      clearInterval(retry);
      market?.stop();
      relayer.stop();
      kit.stop();
      relayerSender.stop();
      faucetSender?.stop();
      await server.stop(true);
      // a balance pass may still be reading, let it finish before the database closes
      await Promise.race([loop.watcherIdle(), Bun.sleep(5000)]);
      await clients.close();
      store.db.close();
      log("server.stop", { port });
    },
  };
};

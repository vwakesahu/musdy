import {
  Accepted,
  Candle,
  Deployment,
  DepositAddress,
  DepositChain,
  ErrorBody,
  FeedItem,
  Health,
  LeaderRow,
  Nonce,
  Profile,
  Quote,
  TokenInfo,
  routes,
  type Address,
  type CandleTf,
  type FeedScope,
  type PnlWindow,
  type TokenSort,
  type FaucetBody,
  type FollowBody,
  type IntentBody,
  type LaunchBody,
  type PermitDepositBody,
  type ProfileBody,
  type TradeBody,
  type WithdrawBody,
} from "shared";
import { env } from "./env";

type Schema<T> = { parse: (data: unknown) => T };
type Query = Record<string, string | undefined>;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const fill = (path: string, params: Record<string, string>) =>
  path.replace(/:([a-zA-Z]+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));

const url = (path: string, query?: Query) => {
  const u = new URL(env.serverUrl + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") u.searchParams.set(k, v);
  return u.toString();
};

async function request<T>(schema: Schema<T>, path: string, init?: { query?: Query; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, init?.query), {
      method: init?.body === undefined ? "GET" : "POST",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("network", "Can't reach the musdy server", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ErrorBody.safeParse(data);
    throw err.success ? new ApiError(err.data.code, err.data.message, res.status) : new ApiError("http", `Server answered ${res.status}`, res.status);
  }
  return schema.parse(data);
}

const ignore: Schema<null> = { parse: () => null };

export type ChainToken = { chainId: number; address: string };
const onChain = (t: ChainToken) => (t.chainId === env.chainId ? undefined : String(t.chainId));

export const api = {
  health: () => request(Health, routes.health),
  config: () => request(Deployment, routes.config),
  tokens: (sort: TokenSort) => request(TokenInfo.array(), routes.tokens, { query: { sort } }),
  token: (t: ChainToken) => request(TokenInfo, fill(routes.token, { address: t.address }), { query: { chainId: onChain(t) } }),
  candles: (t: ChainToken, tf: CandleTf) => request(Candle.array(), fill(routes.candles, { address: t.address }), { query: { tf, chainId: onChain(t) } }),
  tokenTrades: (t: ChainToken, before?: string) =>
    request(FeedItem.array(), fill(routes.tokenTrades, { address: t.address }), { query: { before, chainId: onChain(t) } }),
  feed: (scope: FeedScope, address?: Address, before?: string) =>
    request(FeedItem.array(), routes.feed, { query: { scope, address, before } }),
  user: (address: Address, viewer?: Address) => request(Profile, fill(routes.user, { address }), { query: { viewer } }),
  userTrades: (address: Address) => request(FeedItem.array(), fill(routes.userTrades, { address })),
  leaderboard: (window: PnlWindow) => request(LeaderRow.array(), routes.leaderboard, { query: { window } }),
  quote: (t: ChainToken, isBuy: boolean, amountIn: bigint) =>
    request(Quote, routes.quote, { query: { token: t.address, chainId: onChain(t), isBuy: String(isBuy), amountIn: amountIn.toString() } }),
  nonce: (address: Address) => request(Nonce, fill(routes.nonce, { address })),
  trade: (body: TradeBody) => request(Accepted, routes.trade, { body }),
  intent: (body: IntentBody) => request(Accepted, routes.intent, { body }),
  depositChains: () => request(DepositChain.array(), routes.depositChains),
  depositAddress: (address: Address, chainId: number) => request(DepositAddress, fill(routes.depositAddress, { address, chainId: String(chainId) })),
  withdraw: (body: WithdrawBody) => request(Accepted, routes.withdraw, { body }),
  launch: (body: LaunchBody) => request(Accepted, routes.launch, { body }),
  deposit: (body: PermitDepositBody) => request(Accepted, routes.deposit, { body }),
  faucet: (body: FaucetBody) => request(Accepted, routes.faucet, { body }),
  profile: (body: ProfileBody) => request(Profile, routes.profile, { body }),
  follow: (body: FollowBody) => request(ignore, routes.follow, { body }),
};

import type { Database } from "bun:sqlite";
import type { TokenInfo } from "shared";
import { applyFlow, type Flow, type Holding } from "./pnl";

export type TokenKind = TokenInfo["kind"];

export interface TokenRow {
  address: string;
  symbol: string;
  name: string;
  image: string | null;
  decimals: number;
  kind: TokenKind;
  creator: string | null;
  created_at: number;
  pool: string | null;
  graduated: number;
  virtual_musd: string | null;
  virtual_token: string | null;
  virtual_token0: string | null;
  total_supply: string;
}

export interface TradeRow {
  id: string;
  block: number;
  log_index: number;
  ts: number;
  tx_hash: string;
  user: string;
  token: string;
  is_buy: number;
  musd_amount: string;
  token_amount: string;
  fee: string;
  ref: string | null;
  venue: "pool" | "curve";
  price: string;
  price_f: number;
  musd_f: number;
}

export interface TransferRow {
  id: string;
  block: number;
  log_index: number;
  ts: number;
  kind: "deposit" | "withdraw";
  user: string;
  token: string;
  amount: string;
  to_addr: string | null;
}

export interface ProfileRow {
  address: string;
  handle: string | null;
  avatar: string | null;
}

export interface PriceRow {
  token: string;
  ts: number;
  block: number;
  price: string;
}

// running average cost holding of one user in one token, kept by the indexer as events land
export interface PositionRow {
  user: string;
  token: string;
  amount: string;
  cost: string;
  realized: string;
  bought: string;
  volume: string;
  trades: number;
}

export interface PositionState extends Holding {
  user: string;
  token: string;
  bought: bigint;
  volume: bigint;
  trades: number;
}

export const toPosition = (r: PositionRow): PositionState => ({
  user: r.user,
  token: r.token,
  amount: BigInt(r.amount),
  cost: BigInt(r.cost),
  realized: BigInt(r.realized),
  bought: BigInt(r.bought),
  volume: BigInt(r.volume),
  trades: r.trades,
});

export type FaucetClaim = "ok" | "address" | "ip" | "global";

const lc = (a: string) => a.toLowerCase();
export const PAGE = 50;

export class Store {
  constructor(readonly db: Database) {}

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  getMeta(key: string): string | null {
    return this.db.query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
  }

  setMeta(key: string, value: string) {
    this.db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // tokens
  seedToken(t: { address: string; symbol: string; name: string; decimals: number; kind: TokenKind; createdAt: number }) {
    this.db
      .query(
        "INSERT OR IGNORE INTO tokens (address, symbol, name, image, decimals, kind, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)",
      )
      .run(lc(t.address), t.symbol, t.name, t.decimals, t.kind, t.createdAt);
  }

  insertLaunchToken(t: {
    address: string;
    symbol: string;
    name: string;
    image: string;
    creator: string;
    createdAt: number;
    virtualMusd: bigint;
    virtualToken: bigint;
    totalSupply: bigint;
  }): boolean {
    const r = this.db
      .query(
        `INSERT OR IGNORE INTO tokens (address, symbol, name, image, decimals, kind, creator, created_at, virtual_musd, virtual_token, virtual_token0, total_supply)
         VALUES (?, ?, ?, ?, 18, 'launch', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lc(t.address),
        t.symbol,
        t.name,
        t.image === "" ? null : t.image,
        lc(t.creator),
        t.createdAt,
        t.virtualMusd.toString(),
        t.virtualToken.toString(),
        t.virtualToken.toString(),
        t.totalSupply.toString(),
      );
    return r.changes === 1;
  }

  token(address: string): TokenRow | null {
    return this.db.query<TokenRow, [string]>("SELECT * FROM tokens WHERE address = ?").get(lc(address));
  }

  tokens(): TokenRow[] {
    return this.db.query<TokenRow, []>("SELECT * FROM tokens ORDER BY created_at DESC, address").all();
  }

  setPool(token: string, pool: string) {
    this.db.query("UPDATE tokens SET pool = ? WHERE address = ?").run(lc(pool), lc(token));
  }

  setSupply(token: string, supply: bigint) {
    this.db.query("UPDATE tokens SET total_supply = ? WHERE address = ?").run(supply.toString(), lc(token));
  }

  setCurve(token: string, virtualMusd: bigint, virtualToken: bigint) {
    this.db
      .query("UPDATE tokens SET virtual_musd = ?, virtual_token = ? WHERE address = ?")
      .run(virtualMusd.toString(), virtualToken.toString(), lc(token));
  }

  graduate(token: string, pool: string) {
    this.db.query("UPDATE tokens SET graduated = 1, pool = ? WHERE address = ?").run(lc(pool), lc(token));
  }

  // events. every insert is idempotent on txHash:logIndex and reports whether it was new
  // a new trade also moves the trader's position, in the caller's transaction
  insertTrade(t: TradeRow): boolean {
    const isNew =
      this.db
        .query(
          `INSERT OR IGNORE INTO trades (id, block, log_index, ts, tx_hash, user, token, is_buy, musd_amount, token_amount, fee, ref, venue, price, price_f, musd_f)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          t.id,
          t.block,
          t.log_index,
          t.ts,
          t.tx_hash,
          lc(t.user),
          lc(t.token),
          t.is_buy,
          t.musd_amount,
          t.token_amount,
          t.fee,
          t.ref ? lc(t.ref) : null,
          t.venue,
          t.price,
          t.price_f,
          t.musd_f,
        ).changes === 1;
    if (isNew)
      this.applyFlow(t.user, t.token, { kind: t.is_buy ? "buy" : "sell", amount: BigInt(t.token_amount), musd: BigInt(t.musd_amount) });
    return isNew;
  }

  insertTransfer(t: TransferRow): boolean {
    return (
      this.db
        .query(
          "INSERT OR IGNORE INTO transfers (id, block, log_index, ts, kind, user, token, amount, to_addr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(t.id, t.block, t.log_index, t.ts, t.kind, lc(t.user), lc(t.token), t.amount, t.to_addr ? lc(t.to_addr) : null)
        .changes === 1
    );
  }

  insertLaunch(id: string, block: number, ts: number, user: string, token: string): boolean {
    return (
      this.db
        .query("INSERT OR IGNORE INTO launches (id, block, ts, user, token) VALUES (?, ?, ?, ?, ?)")
        .run(id, block, ts, lc(user), lc(token)).changes === 1
    );
  }

  insertCurveTrade(c: {
    id: string;
    block: number;
    logIndex: number;
    ts: number;
    token: string;
    trader: string;
    isBuy: boolean;
    musdAmount: bigint;
    tokenAmount: bigint;
    virtualMusd: bigint;
    virtualToken: bigint;
  }): boolean {
    return (
      this.db
        .query(
          `INSERT OR IGNORE INTO curve_trades (id, block, log_index, ts, token, trader, is_buy, musd_amount, token_amount, virtual_musd, virtual_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          c.id,
          c.block,
          c.logIndex,
          c.ts,
          lc(c.token),
          lc(c.trader),
          c.isBuy ? 1 : 0,
          c.musdAmount.toString(),
          c.tokenAmount.toString(),
          c.virtualMusd.toString(),
          c.virtualToken.toString(),
        ).changes === 1
    );
  }

  insertGraduation(g: { id: string; block: number; ts: number; token: string; pool: string; musd: bigint; tokens: bigint }): boolean {
    return (
      this.db
        .query(
          "INSERT OR IGNORE INTO graduations (id, block, ts, token, pool, musd_liquidity, token_liquidity) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(g.id, g.block, g.ts, lc(g.token), lc(g.pool), g.musd.toString(), g.tokens.toString()).changes === 1
    );
  }

  // trades
  private cursor(before?: string): { block: number; log_index: number } | null {
    if (!before) return null;
    return this.db
      .query<{ block: number; log_index: number }, [string]>("SELECT block, log_index FROM trades WHERE id = ?")
      .get(before);
  }

  // newest first. `where` and `params` select the subset, `before` pages by trade id
  private page(where: string, params: (string | number)[], before?: string, limit = PAGE): TradeRow[] {
    const c = this.cursor(before);
    const clauses = [where];
    const args = [...params];
    if (before && !c) return [];
    if (c) {
      clauses.push("(block < ? OR (block = ? AND log_index < ?))");
      args.push(c.block, c.block, c.log_index);
    }
    args.push(limit);
    return this.db
      .query<TradeRow, (string | number)[]>(
        `SELECT * FROM trades WHERE ${clauses.join(" AND ")} ORDER BY block DESC, log_index DESC LIMIT ?`,
      )
      .all(...args);
  }

  globalTrades(before?: string, limit = PAGE) {
    return this.page("1 = 1", [], before, limit);
  }

  tokenTrades(token: string, before?: string, limit = PAGE) {
    return this.page("token = ?", [lc(token)], before, limit);
  }

  userTrades(user: string, before?: string, limit = PAGE) {
    return this.page("user = ?", [lc(user)], before, limit);
  }

  followingTrades(follower: string, before?: string, limit = PAGE) {
    return this.page("user IN (SELECT target FROM follows WHERE follower = ?)", [lc(follower)], before, limit);
  }

  tradeCount(user: string): number {
    return this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM trades WHERE user = ?").get(lc(user))?.n ?? 0;
  }

  // oldest first, for candles
  tokenTicks(token: string, since: number): { ts: number; price_f: number; musd_f: number }[] {
    return this.db
      .query<{ ts: number; price_f: number; musd_f: number }, [string, number]>(
        "SELECT ts, price_f, musd_f FROM trades WHERE token = ? AND ts >= ? ORDER BY block, log_index",
      )
      .all(lc(token), since);
  }

  tradesSince(ts: number): TradeRow[] {
    return this.db.query<TradeRow, [number]>("SELECT * FROM trades WHERE ts >= ?").all(ts);
  }

  traders(): string[] {
    return this.db.query<{ user: string }, []>("SELECT DISTINCT user FROM trades").all().map((r) => r.user);
  }

  // all trades and token transfers of a user, oldest first
  userHistory(user: string): { trades: TradeRow[]; transfers: TransferRow[] } {
    const u = lc(user);
    return {
      trades: this.db.query<TradeRow, [string]>("SELECT * FROM trades WHERE user = ? ORDER BY block, log_index").all(u),
      transfers: this.db
        .query<TransferRow, [string]>("SELECT * FROM transfers WHERE user = ? ORDER BY block, log_index")
        .all(u),
    };
  }

  heldTokens(user: string): string[] {
    const u = lc(user);
    return this.db
      .query<{ token: string }, [string, string]>(
        "SELECT token FROM trades WHERE user = ? UNION SELECT token FROM transfers WHERE user = ?",
      )
      .all(u, u)
      .map((r) => r.token);
  }

  // prices
  insertPrice(p: PriceRow) {
    this.db.query("INSERT INTO prices (token, ts, block, price) VALUES (?, ?, ?, ?)").run(lc(p.token), p.ts, p.block, p.price);
  }

  allPrices(): PriceRow[] {
    return this.db.query<PriceRow, []>("SELECT * FROM prices ORDER BY ts, block, rowid").all();
  }

  // profiles and follows
  profile(address: string): ProfileRow | null {
    return this.db.query<ProfileRow, [string]>("SELECT address, handle, avatar FROM profiles WHERE address = ?").get(lc(address));
  }

  profileByHandle(handle: string): ProfileRow | null {
    return this.db.query<ProfileRow, [string]>("SELECT address, handle, avatar FROM profiles WHERE handle = ?").get(handle);
  }

  setHandle(address: string, handle: string, now: number) {
    this.db
      .query(
        "INSERT INTO profiles (address, handle, avatar, updated_at) VALUES (?, ?, NULL, ?) ON CONFLICT(address) DO UPDATE SET handle = excluded.handle, updated_at = excluded.updated_at",
      )
      .run(lc(address), handle, now);
  }

  followIssued(follower: string, target: string): number | null {
    return (
      this.db
        .query<{ issued: number }, [string, string]>("SELECT issued FROM follow_issued WHERE follower = ? AND target = ?")
        .get(lc(follower), lc(target))?.issued ?? null
    );
  }

  setFollow(follower: string, target: string, follow: boolean, issued: number, now: number) {
    this.tx(() => {
      this.db
        .query(
          "INSERT INTO follow_issued (follower, target, issued) VALUES (?, ?, ?) ON CONFLICT(follower, target) DO UPDATE SET issued = excluded.issued",
        )
        .run(lc(follower), lc(target), issued);
      if (follow)
        this.db.query("INSERT OR IGNORE INTO follows (follower, target, created_at) VALUES (?, ?, ?)").run(lc(follower), lc(target), now);
      else this.db.query("DELETE FROM follows WHERE follower = ? AND target = ?").run(lc(follower), lc(target));
    });
  }

  followers(target: string): string[] {
    return this.db
      .query<{ follower: string }, [string]>("SELECT follower FROM follows WHERE target = ?")
      .all(lc(target))
      .map((r) => r.follower);
  }

  isFollowing(follower: string, target: string): boolean {
    return !!this.db.query("SELECT 1 FROM follows WHERE follower = ? AND target = ?").get(lc(follower), lc(target));
  }

  // positions
  position(user: string, token: string): PositionState | null {
    const r = this.db.query<PositionRow, [string, string]>("SELECT * FROM positions WHERE user = ? AND token = ?").get(lc(user), lc(token));
    return r ? toPosition(r) : null;
  }

  private writePosition(p: PositionState) {
    this.db
      .query(
        `INSERT INTO positions (user, token, amount, cost, realized, bought, volume, trades) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user, token) DO UPDATE SET amount = excluded.amount, cost = excluded.cost, realized = excluded.realized,
         bought = excluded.bought, volume = excluded.volume, trades = excluded.trades`,
      )
      .run(lc(p.user), lc(p.token), p.amount.toString(), p.cost.toString(), p.realized.toString(), p.bought.toString(), p.volume.toString(), p.trades);
  }

  applyFlow(user: string, token: string, f: Pick<Flow, "kind" | "amount" | "musd">) {
    const p = this.position(user, token) ?? { user: lc(user), token: lc(token), amount: 0n, cost: 0n, realized: 0n, bought: 0n, volume: 0n, trades: 0 };
    applyFlow(p, f);
    if (f.kind === "buy" || f.kind === "sell") {
      p.volume += f.musd;
      p.trades++;
      if (f.kind === "buy") p.bought += f.musd;
    }
    this.writePosition(p);
  }

  replacePositions(rows: PositionState[]) {
    this.tx(() => {
      this.db.exec("DELETE FROM positions");
      for (const p of rows) this.writePosition(p);
    });
  }

  positionsOf(user: string): PositionState[] {
    return this.db.query<PositionRow, [string]>("SELECT * FROM positions WHERE user = ?").all(lc(user)).map(toPosition);
  }

  allPositions(): PositionState[] {
    return this.db.query<PositionRow, []>("SELECT * FROM positions").all().map(toPosition);
  }

  // addresses holding a non zero amount of the token
  holderCount(token: string): number {
    return this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM positions WHERE token = ? AND amount != '0'").get(lc(token))?.n ?? 0;
  }

  // users with any trade or transfer at or after ts
  activeSince(ts: number): Set<string> {
    return new Set(
      this.db
        .query<{ user: string }, [number, number]>("SELECT user FROM trades WHERE ts >= ? UNION SELECT user FROM transfers WHERE ts >= ?")
        .all(ts, ts)
        .map((r) => r.user),
    );
  }

  tradeAmountsSince(ts: number): { user: string; is_buy: number; musd_amount: string }[] {
    return this.db.query<{ user: string; is_buy: number; musd_amount: string }, [number]>("SELECT user, is_buy, musd_amount FROM trades WHERE ts >= ?").all(ts);
  }

  followCounts(address: string): { followers: number; following: number } {
    const a = lc(address);
    const followers = this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM follows WHERE target = ?").get(a)?.n ?? 0;
    const following = this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM follows WHERE follower = ?").get(a)?.n ?? 0;
    return { followers, following };
  }

  // faucet. one transaction checks the address, the ip and the global hourly cap, then records the claim
  claimFaucet(address: string, ip: string, now: number, limits: { period: number; perIp: number; hourly: number }): FaucetClaim {
    const a = lc(address);
    return this.tx((): FaucetClaim => {
      const last = this.db.query<{ last_at: number }, [string]>("SELECT last_at FROM faucet WHERE address = ?").get(a)?.last_at;
      if (last !== undefined && last >= now - limits.period) return "address";
      const byIp = this.db.query<{ n: number }, [string, number]>("SELECT COUNT(*) AS n FROM faucet_claims WHERE ip = ? AND at > ?").get(ip, now - 86400)?.n ?? 0;
      if (byIp >= limits.perIp) return "ip";
      const hour = this.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM faucet_claims WHERE at > ?").get(now - 3600)?.n ?? 0;
      if (hour >= limits.hourly) return "global";
      this.db.query("INSERT INTO faucet (address, last_at) VALUES (?, ?) ON CONFLICT(address) DO UPDATE SET last_at = excluded.last_at").run(a, now);
      this.db.query("INSERT INTO faucet_claims (address, ip, at) VALUES (?, ?, ?)").run(a, ip, now);
      return "ok";
    });
  }

  releaseFaucet(address: string, at: number) {
    this.tx(() => {
      this.db.query("DELETE FROM faucet WHERE address = ? AND last_at = ?").run(lc(address), at);
      this.db.query("DELETE FROM faucet_claims WHERE address = ? AND at = ?").run(lc(address), at);
    });
  }
}

import type { Database } from "bun:sqlite";
import type { TokenInfo } from "shared";

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
  insertTrade(t: TradeRow): boolean {
    return (
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
        ).changes === 1
    );
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

  // addresses with a non zero vault balance per token, rebuilt from every balance moving event
  holderCounts(): Map<string, number> {
    const bal = new Map<string, bigint>();
    const add = (token: string, user: string, d: bigint) => {
      const k = `${token}:${user}`;
      bal.set(k, (bal.get(k) ?? 0n) + d);
    };
    for (const t of this.db.query<{ token: string; user: string; is_buy: number; token_amount: string }, []>("SELECT token, user, is_buy, token_amount FROM trades").all())
      add(t.token, t.user, t.is_buy ? BigInt(t.token_amount) : -BigInt(t.token_amount));
    for (const t of this.db.query<{ token: string; user: string; kind: string; amount: string }, []>("SELECT token, user, kind, amount FROM transfers").all())
      add(t.token, t.user, t.kind === "deposit" ? BigInt(t.amount) : -BigInt(t.amount));
    const out = new Map<string, number>();
    for (const [k, v] of bal) {
      if (v <= 0n) continue;
      const token = k.slice(0, k.indexOf(":"));
      out.set(token, (out.get(token) ?? 0) + 1);
    }
    return out;
  }

  followCounts(address: string): { followers: number; following: number } {
    const a = lc(address);
    const followers = this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM follows WHERE target = ?").get(a)?.n ?? 0;
    const following = this.db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM follows WHERE follower = ?").get(a)?.n ?? 0;
    return { followers, following };
  }

  // faucet. claim is atomic: it only succeeds if the last claim is older than `since`
  claimFaucet(address: string, now: number, since: number): boolean {
    return (
      this.db
        .query(
          "INSERT INTO faucet (address, last_at) VALUES (?, ?) ON CONFLICT(address) DO UPDATE SET last_at = excluded.last_at WHERE faucet.last_at < ?",
        )
        .run(lc(address), now, since).changes === 1
    );
  }

  releaseFaucet(address: string, at: number) {
    this.db.query("DELETE FROM faucet WHERE address = ? AND last_at = ?").run(lc(address), at);
  }
}

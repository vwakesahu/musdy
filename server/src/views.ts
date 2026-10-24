import { getAddress, zeroAddress } from "viem";
import type { Address, FeedItem, LeaderRow, Pnl, PnlWindow, Position, Profile, TokenInfo, TokenRef, TokenSort, UserRef } from "shared";
import type { PriceBook } from "./price-book";
import { pnlWindow, replay, WINDOW_SECONDS, type Flow, type ValueFn } from "./pnl";
import { curvePrice, ratio, valueOf } from "./pricing";
import type { PositionState, Store, TokenRow, TradeRow } from "./store";

const addr = (a: string): Address => getAddress(a);
const now = () => Math.floor(Date.now() / 1000);
const LIST_LIMIT = 100;
export const LEADER_TTL_MS = 3000;

export class Views {
  private leaderCache = new Map<PnlWindow, { at: number; rows: LeaderRow[] }>();

  constructor(
    private store: Store,
    private book: PriceBook,
    private musd: string,
    private curveSupply: bigint,
    private block: () => number,
  ) {}

  userRef(address: string): UserRef {
    const p = this.store.profile(address);
    return { address: addr(address), handle: p?.handle ?? null, avatar: p?.avatar ?? null };
  }

  tokenRef(address: string): TokenRef {
    const row = this.store.token(address);
    if (!row) return { address: addr(address), symbol: "?", name: "unknown", image: null, decimals: 18 };
    return { address: addr(row.address), symbol: row.symbol, name: row.name, image: row.image, decimals: row.decimals };
  }

  holderCount(token: string): number {
    return this.store.holderCount(token);
  }

  feedItem(t: TradeRow): FeedItem {
    const row = this.store.token(t.token);
    const mcap = row ? valueOf(BigInt(row.total_supply), BigInt(t.price), row.decimals) : 0n;
    return {
      id: t.id,
      block: t.block,
      ts: t.ts,
      user: this.userRef(t.user),
      token: this.tokenRef(t.token),
      isBuy: t.is_buy === 1,
      musdAmount: t.musd_amount,
      tokenAmount: t.token_amount,
      priceMusd: t.price,
      marketCapMusd: mcap.toString(),
      ref: t.ref && t.ref !== zeroAddress ? this.userRef(t.ref) : null,
      venue: t.venue,
      txHash: t.tx_hash as `0x${string}`,
    };
  }

  feed(rows: TradeRow[]): FeedItem[] {
    return rows.map((r) => this.feedItem(r));
  }

  replay(topic: string): FeedItem[] | null {
    const [kind, sub, rest] = topic.split(":");
    let rows: TradeRow[] | null = null;
    if (topic === "feed:global") rows = this.store.globalTrades();
    else if (kind === "feed" && sub === "following" && rest) rows = this.store.followingTrades(rest);
    else if (kind === "token" && sub) rows = this.store.tokenTrades(sub);
    else if (kind === "user" && sub) rows = this.store.userTrades(sub);
    return rows ? this.feed(rows).reverse() : null;
  }

  priceOf(row: TokenRow): bigint {
    if (row.kind === "musd") return 10n ** 18n;
    if (row.kind === "launch" && !row.graduated && row.virtual_musd && row.virtual_token)
      return curvePrice(BigInt(row.virtual_musd), BigInt(row.virtual_token)) ?? 0n;
    return this.book.latest(row.address) ?? 0n;
  }

  private volumes(since: number): Map<string, bigint> {
    const out = new Map<string, bigint>();
    for (const t of this.store.tradesSince(since)) out.set(t.token, (out.get(t.token) ?? 0n) + BigInt(t.musd_amount));
    return out;
  }

  tokenInfo(row: TokenRow, volumes?: Map<string, bigint>): TokenInfo {
    const ts = now();
    const vols = volumes ?? this.volumes(ts - 86400);
    const price = this.priceOf(row);
    const onCurve = row.kind === "launch" && !row.graduated;
    const sold = onCurve && row.virtual_token0 && row.virtual_token ? BigInt(row.virtual_token0) - BigInt(row.virtual_token) : 0n;
    return {
      address: addr(row.address),
      symbol: row.symbol,
      name: row.name,
      image: row.image,
      decimals: row.decimals,
      kind: row.kind,
      venue: onCurve ? "curve" : "pool",
      creator: row.creator ? addr(row.creator) : null,
      priceMusd: price.toString(),
      change24h: this.book.change24h(row.address, ts),
      volume24hMusd: (vols.get(row.address) ?? 0n).toString(),
      marketCapMusd: valueOf(BigInt(row.total_supply), price, row.decimals).toString(),
      curveProgress: onCurve ? Math.min(1, ratio(sold, this.curveSupply)) : null,
      pool: row.pool && row.pool !== zeroAddress ? addr(row.pool) : null,
      holders: this.holderCount(row.address),
      createdAt: row.created_at,
    };
  }

  token(address: string): TokenInfo | null {
    const row = this.store.token(address);
    return row ? this.tokenInfo(row) : null;
  }

  tokens(sort: TokenSort): TokenInfo[] {
    const vols = this.volumes(now() - 86400);
    const rows = this.store.tokens().filter((r) => r.kind !== "musd");
    const infos = rows.map((r) => this.tokenInfo(r, vols));
    if (sort === "new") return infos.filter((t) => t.kind === "launch").slice(0, LIST_LIMIT);
    if (sort === "stocks") return infos.filter((t) => t.kind === "stock");
    return infos
      .sort((a, b) => {
        const v = BigInt(b.volume24hMusd) - BigInt(a.volume24hMusd);
        if (v !== 0n) return v > 0n ? 1 : -1;
        const m = BigInt(b.marketCapMusd) - BigInt(a.marketCapMusd);
        return m === 0n ? 0 : m > 0n ? 1 : -1;
      })
      .slice(0, LIST_LIMIT);
  }

  value: ValueFn = (token, amount, ts) => {
    const row = this.store.token(token);
    if (!row) return 0n;
    const price = ts >= now() ? this.priceOf(row) : (this.book.at(token, ts) ?? 0n);
    return valueOf(amount, price, row.decimals);
  };

  flows(user: string): Flow[] {
    const { trades, transfers } = this.store.userHistory(user);
    const flows: (Flow & { block: number; log: number })[] = [];
    for (const t of trades)
      flows.push({
        ts: t.ts,
        block: t.block,
        log: t.log_index,
        token: t.token,
        kind: t.is_buy ? "buy" : "sell",
        amount: BigInt(t.token_amount),
        musd: BigInt(t.musd_amount),
      });
    for (const t of transfers) {
      if (t.token === this.musd) continue;
      const amount = BigInt(t.amount);
      flows.push({
        ts: t.ts,
        block: t.block,
        log: t.log_index,
        token: t.token,
        kind: t.kind === "deposit" ? "in" : "out",
        amount,
        musd: t.kind === "deposit" ? this.value(t.token, amount, t.ts) : 0n,
      });
    }
    return flows.sort((a, b) => a.block - b.block || a.log - b.log);
  }

  recomputePositions(): PositionState[] {
    const out: PositionState[] = [];
    const users = new Set([...this.store.traders(), ...this.store.allPositions().map((p) => p.user)]);
    for (const user of users) {
      const flows = this.flows(user);
      for (const [token, h] of replay(flows)) {
        const p: PositionState = { user, token, ...h, bought: 0n, volume: 0n, trades: 0 };
        for (const f of flows) {
          if (f.token !== token || (f.kind !== "buy" && f.kind !== "sell")) continue;
          p.volume += f.musd;
          p.trades++;
          if (f.kind === "buy") p.bought += f.musd;
        }
        out.push(p);
      }
    }
    return out;
  }

  rebuildPositions() {
    this.store.replacePositions(this.recomputePositions());
  }

  positions(user: string): Position[] {
    const out: Position[] = [];
    for (const h of this.store.positionsOf(user)) {
      if (h.amount === 0n) continue;
      const row = this.store.token(h.token);
      if (!row) continue;
      const value = valueOf(h.amount, this.priceOf(row), row.decimals);
      const pnl = value - h.cost;
      out.push({
        token: this.tokenRef(h.token),
        amount: h.amount.toString(),
        avgCostMusd: ((h.cost * 10n ** BigInt(row.decimals)) / h.amount).toString(),
        valueMusd: value.toString(),
        costMusd: h.cost.toString(),
        pnlMusd: pnl.toString(),
        pnlPct: ratio(pnl, h.cost),
        withdrawable: !(row.kind === "launch" && !row.graduated),
      });
    }
    return out.sort((a, b) => (BigInt(b.valueMusd) > BigInt(a.valueMusd) ? 1 : -1));
  }

  pnl(user: string): Pnl {
    const flows = this.flows(user);
    const ts = now();
    return {
      d1: pnlWindow(flows, ts, "d1", this.value).toString(),
      d7: pnlWindow(flows, ts, "d7", this.value).toString(),
      all: pnlWindow(flows, ts, "all", this.value).toString(),
    };
  }

  profile(user: string, cash: bigint, viewer: string | null = null): Profile {
    const positions = this.positions(user);
    const total = positions.reduce((s, p) => s + BigInt(p.valueMusd), cash);
    return {
      user: this.userRef(user),
      balanceMusd: cash.toString(),
      totalValueMusd: total.toString(),
      pnl: this.pnl(user),
      positions,
      ...this.store.followCounts(user),
      followedByViewer: viewer ? this.store.isFollowing(viewer, user) : null,
      trades: this.store.tradeCount(user),
    };
  }

  // window pnl replays only users who moved inside it, everyone else is marked to market
  leaderboard(window: PnlWindow): LeaderRow[] {
    const cached = this.leaderCache.get(window);
    if (cached && Date.now() - cached.at < LEADER_TTL_MS) return cached.rows;
    const ts = now();
    const byUser = new Map<string, PositionState[]>();
    for (const p of this.store.allPositions()) byUser.set(p.user, [...(byUser.get(p.user) ?? []), p]);

    const stats = new Map<string, { volume: bigint; bought: bigint; trades: number }>();
    let active = new Set<string>();
    const since = window === "all" ? 0 : ts - WINDOW_SECONDS[window];
    if (window === "all") {
      for (const [user, ps] of byUser)
        stats.set(user, ps.reduce((s, p) => ({ volume: s.volume + p.volume, bought: s.bought + p.bought, trades: s.trades + p.trades }), { volume: 0n, bought: 0n, trades: 0 }));
    } else {
      active = this.store.activeSince(since);
      for (const t of this.store.tradeAmountsSince(since)) {
        const s = stats.get(t.user) ?? { volume: 0n, bought: 0n, trades: 0 };
        const m = BigInt(t.musd_amount);
        s.volume += m;
        if (t.is_buy) s.bought += m;
        s.trades++;
        stats.set(t.user, s);
      }
    }

    const rows: Omit<LeaderRow, "rank">[] = [];
    for (const [user, ps] of byUser) {
      if (!ps.some((p) => p.trades > 0)) continue;
      let pnl = 0n;
      if (window === "all") {
        for (const p of ps) pnl += p.realized + (p.amount > 0n ? this.value(p.token, p.amount, ts) - p.cost : 0n);
      } else if (active.has(user)) {
        pnl = pnlWindow(this.flows(user), ts, window, this.value);
      } else {
        for (const p of ps) if (p.amount > 0n) pnl += this.value(p.token, p.amount, ts) - this.value(p.token, p.amount, since);
      }
      const s = stats.get(user) ?? { volume: 0n, bought: 0n, trades: 0 };
      if (pnl === 0n && s.trades === 0) continue;
      rows.push({ user: this.userRef(user), pnlMusd: pnl.toString(), pnlPct: ratio(pnl, s.bought), volumeMusd: s.volume.toString(), trades: s.trades });
    }
    rows.sort((a, b) => {
      const d = BigInt(b.pnlMusd) - BigInt(a.pnlMusd);
      return d === 0n ? 0 : d > 0n ? 1 : -1;
    });
    const out = rows.slice(0, LIST_LIMIT).map((r, i) => ({ rank: i + 1, ...r }));
    this.leaderCache.set(window, { at: Date.now(), rows: out });
    return out;
  }
}

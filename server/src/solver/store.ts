import { tokenKey } from "shared";
import type { Store } from "../store";
import type { RelayCurrency } from "./relay";

export type IntentStatus = "open" | "filling" | "filled" | "settling" | "settled" | "refunded";

export interface IntentRow {
  id: string;
  user: string;
  is_buy: number;
  chain_id: number;
  token: string;
  amount_in: string;
  min_out: string;
  ref: string | null;
  status: IntentStatus;
  request_id: string | null;
  token_amount: string | null;
  musd_out: string | null;
  fee: string;
  error: string | null;
  opened_at: number;
  updated_at: number;
}

export interface DepositAddressRow {
  user: string;
  chain_id: number;
  address: string;
  min_usd: number;
  created_at: number;
  hot_until: number;
  checked_at: number;
}

export interface FillRow {
  request_id: string;
  user: string;
  chain_id: number;
  address: string;
  usdc: string;
  status: "pending" | "sent" | "confirmed" | "failed" | "refunded";
  hash: string | null;
  error: string | null;
  created_at: number;
}

export type SweepStatus = "pending" | "submitted" | "received" | "credited" | "failed";

export interface SweepRow {
  id: string;
  user: string;
  chain_id: number;
  token: string;
  value: string;
  valid_after: string;
  valid_before: string;
  nonce: string;
  sig: string;
  status: SweepStatus;
  hash: string | null;
  error: string | null;
  created_at: number;
}

const now = () => Math.floor(Date.now() / 1000);
const lc = (a: string) => a.toLowerCase();

export const xKey = (chainId: number, address: string) => lc(tokenKey({ chainId, address }));

export class SolverStore {
  constructor(readonly store: Store) {}

  private get db() {
    return this.store.db;
  }

  openIntent(i: { id: string; user: string; isBuy: boolean; chainId: number; token: string; amountIn: bigint; minOut: bigint; ref: string; at: number }): boolean {
    return (
      this.db
        .query(
          `INSERT OR IGNORE INTO intents (id, user, is_buy, chain_id, token, amount_in, min_out, ref, status, opened_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        )
        .run(lc(i.id), lc(i.user), i.isBuy ? 1 : 0, i.chainId, i.token, i.amountIn.toString(), i.minOut.toString(), lc(i.ref), i.at, now()).changes === 1
    );
  }

  intent(id: string): IntentRow | null {
    return this.db.query<IntentRow, [string]>("SELECT * FROM intents WHERE id = ?").get(lc(id));
  }

  update(id: string, f: Partial<Pick<IntentRow, "status" | "request_id" | "token_amount" | "musd_out" | "fee" | "error">>) {
    const keys = Object.keys(f) as (keyof typeof f)[];
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    this.db.query(`UPDATE intents SET ${sets}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k] ?? null), now(), lc(id));
  }

  unfinished(): IntentRow[] {
    return this.db.query<IntentRow, []>("SELECT * FROM intents WHERE status IN ('open', 'filling', 'filled', 'settling') ORDER BY opened_at").all();
  }

  // tokens the user already committed to sells still in flight
  reservedSells(user: string, chainId: number, token: string, except?: string): bigint {
    const rows = this.db
      .query<{ id: string; amount_in: string }, [string, number, string]>(
        "SELECT id, amount_in FROM intents WHERE user = ? AND chain_id = ? AND token = ? AND is_buy = 0 AND status IN ('open', 'filling', 'filled', 'settling')",
      )
      .all(lc(user), chainId, token);
    return rows.filter((r) => r.id !== except?.toLowerCase()).reduce((s, r) => s + BigInt(r.amount_in), 0n);
  }

  held(user: string, chainId: number, token: string): bigint {
    return this.store.position(user, xKey(chainId, token))?.amount ?? 0n;
  }

  seedCoin(c: RelayCurrency) {
    const key = xKey(c.chainId, c.address);
    this.store.seedToken({ address: key, symbol: c.symbol, name: c.name, image: c.metadata?.logoURI ?? null, decimals: c.decimals, kind: "meme", createdAt: now() });
    this.db.query("UPDATE tokens SET chain_id = ?, raw_address = ? WHERE address = ?").run(c.chainId, c.address, key);
  }

  brand(key: string, m: { symbol: string; name: string; image: string | null }) {
    this.db.query("UPDATE tokens SET symbol = ?, name = ?, image = COALESCE(?, image) WHERE address = ?").run(m.symbol, m.name, m.image, key);
  }

  depositAddress(user: string, chainId: number): DepositAddressRow | null {
    return this.db.query<DepositAddressRow, [string, number]>("SELECT * FROM deposit_addresses WHERE user = ? AND chain_id = ?").get(lc(user), chainId);
  }

  saveDepositAddress(user: string, chainId: number, address: string, minUsd: number) {
    const t = now();
    this.db
      .query("INSERT OR IGNORE INTO deposit_addresses (user, chain_id, address, min_usd, created_at, hot_until) VALUES (?, ?, ?, ?, ?, ?)")
      .run(lc(user), chainId, address, minUsd, t, t + 3600);
  }

  heat(user: string, chainId: number) {
    this.db.query("UPDATE deposit_addresses SET hot_until = ? WHERE user = ? AND chain_id = ?").run(now() + 3600, lc(user), chainId);
  }

  toCheck(hotCap: number, coldCap: number): DepositAddressRow[] {
    const t = now();
    const hot = this.db.query<DepositAddressRow, [number, number]>("SELECT * FROM deposit_addresses WHERE hot_until > ? ORDER BY checked_at LIMIT ?").all(t, hotCap);
    const cold = this.db.query<DepositAddressRow, [number, number]>("SELECT * FROM deposit_addresses WHERE hot_until <= ? ORDER BY checked_at LIMIT ?").all(t, coldCap);
    return [...hot, ...cold];
  }

  checked(address: string) {
    this.db.query("UPDATE deposit_addresses SET checked_at = ? WHERE address = ?").run(now(), address);
  }

  fill(requestId: string): FillRow | null {
    return this.db.query<FillRow, [string]>("SELECT * FROM deposit_fills WHERE request_id = ?").get(requestId);
  }

  addFill(f: { requestId: string; user: string; chainId: number; address: string; usdc: bigint; status: FillRow["status"] }): boolean {
    return (
      this.db
        .query("INSERT OR IGNORE INTO deposit_fills (request_id, user, chain_id, address, usdc, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(f.requestId, lc(f.user), f.chainId, f.address, f.usdc.toString(), f.status, now()).changes === 1
    );
  }

  setFill(requestId: string, status: FillRow["status"], hash: string | null, error: string | null = null) {
    this.db.query("UPDATE deposit_fills SET status = ?, hash = COALESCE(?, hash), error = ? WHERE request_id = ?").run(status, hash, error, requestId);
  }

  pendingFills(): FillRow[] {
    return this.db.query<FillRow, []>("SELECT * FROM deposit_fills WHERE status IN ('pending', 'sent') ORDER BY created_at").all();
  }

  sweep(id: string): SweepRow | null {
    return this.db.query<SweepRow, [string]>("SELECT * FROM sweeps WHERE id = ?").get(id);
  }

  addSweep(r: Omit<SweepRow, "status" | "hash" | "error" | "created_at">): boolean {
    return (
      this.db
        .query("INSERT OR IGNORE INTO sweeps (id, user, chain_id, token, value, valid_after, valid_before, nonce, sig, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
        .run(r.id, lc(r.user), r.chain_id, lc(r.token), r.value, r.valid_after, r.valid_before, lc(r.nonce), r.sig, now()).changes === 1
    );
  }

  setSweep(id: string, status: SweepStatus, hash: string | null, error: string | null = null) {
    this.db.query("UPDATE sweeps SET status = ?, hash = COALESCE(?, hash), error = ? WHERE id = ?").run(status, hash, error, id);
  }

  openSweeps(): SweepRow[] {
    return this.db.query<SweepRow, []>("SELECT * FROM sweeps WHERE status IN ('pending', 'submitted', 'received') ORDER BY created_at").all();
  }

  // musd the solver still owes on fills not yet credited
  owedUsdc(): bigint {
    return this.pendingFills().reduce((s, f) => s + BigInt(f.usdc), 0n) + this.openSweeps().reduce((s, r) => s + BigInt(r.value), 0n);
  }
}

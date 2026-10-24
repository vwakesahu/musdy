import type { Address, Hash } from "viem";
import { SOLANA, type DepositAddress, type DepositChain, type TxStatus } from "shared";
import { HttpError } from "../errors";
import type { Hub } from "../hub";
import { errMessage, log } from "../log";
import { BASE, BASE_USDC, DEPOSIT_ROUTES, USDC_TO_MUSD, type DepositRoute } from "./config";
import type { MezoOps } from "./mezo";
import { amountOut, RelayError, type Quote, type RelayApi } from "./relay";
import type { FillRow, SolverStore } from "./store";

export interface DepositDeps {
  relay: RelayApi;
  store: SolverStore;
  hub: Hub;
  ops: MezoOps | null;
  receipt?: (hash: Hash) => Promise<boolean | null>;
  tickMs?: number;
}

const HOT_PER_TICK = 20;
const COLD_PER_TICK = 3;
const icon = (id: number) => `https://assets.relay.link/icons/${id}/light.png`;

export const minUsdOf = (q: Quote): number => {
  const usd = ["gas", "relayer"].reduce((s, k) => s + Number(q.fees?.[k]?.amountUsd ?? 0), 0);
  return Math.max(1, Math.ceil(usd * 5));
};

export class Deposits {
  private icons = new Map<number, string>();
  private creating = new Map<string, Promise<DepositAddress>>();
  private crediting = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(private d: DepositDeps) {}

  start() {
    void this.loadIcons();
    this.timer = setInterval(() => void this.tick(), this.d.tickMs ?? 15_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async loadIcons() {
    try {
      for (const c of await this.d.relay.chains()) if (c.iconUrl) this.icons.set(c.id, c.iconUrl);
    } catch (e) {
      log("deposit.chains_error", { error: errMessage(e) });
    }
  }

  private chainOf(r: DepositRoute): DepositChain {
    return { chainId: r.chainId, name: r.name, icon: this.icons.get(r.chainId) ?? icon(r.chainId), currency: r.currency };
  }

  chains(): DepositChain[] {
    return DEPOSIT_ROUTES.map((r) => this.chainOf(r));
  }

  async address(user: Address, chainId: number): Promise<DepositAddress> {
    const route = DEPOSIT_ROUTES.find((r) => r.chainId === chainId);
    if (!route) throw new HttpError(400, "bad_param", `chainId: deposits come from ${DEPOSIT_ROUTES.map((r) => r.chainId).join(", ")}`);
    const ops = this.d.ops;
    if (!ops) throw new HttpError(503, "solver_off", "deposits from other chains are off, the server has no SOLVER_KEY");
    const cached = this.d.store.depositAddress(user, chainId);
    if (cached) {
      this.d.store.heat(user, chainId);
      return { ...this.chainOf(route), address: cached.address, minUsd: cached.min_usd };
    }
    if (chainId === SOLANA && !this.d.relay.hasKey) throw new HttpError(503, "relay_key_missing", "solana deposit addresses need RELAY_API_KEY on the server");
    const k = `${user.toLowerCase()}:${chainId}`;
    const inflight = this.creating.get(k);
    if (inflight) return inflight;
    const p = this.create(user, route, ops.address).finally(() => this.creating.delete(k));
    this.creating.set(k, p);
    return p;
  }

  private async create(user: Address, route: DepositRoute, solver: Address): Promise<DepositAddress> {
    let q: Quote;
    try {
      q = await this.d.relay.quote({
        user,
        recipient: solver,
        originChainId: route.chainId,
        originCurrency: route.token,
        destinationChainId: BASE,
        destinationCurrency: BASE_USDC,
        amount: route.sample,
        tradeType: "EXACT_INPUT",
        useDepositAddress: true,
        refundTo: route.refundTo,
      });
    } catch (e) {
      if (e instanceof RelayError && e.status === 401) throw new HttpError(503, "relay_key_missing", e.message);
      throw new HttpError(502, "relay_error", errMessage(e));
    }
    const address = q.steps.find((s) => s.depositAddress)?.depositAddress;
    if (!address) throw new HttpError(502, "relay_error", "relay returned no deposit address");
    const minUsd = minUsdOf(q);
    this.d.store.saveDepositAddress(user, route.chainId, address, minUsd);
    log("deposit.address", { user, chainId: route.chainId, address });
    const saved = this.d.store.depositAddress(user, route.chainId)!;
    return { ...this.chainOf(route), address: saved.address, minUsd: saved.min_usd };
  }

  private pushTx(user: string, tx: TxStatus) {
    this.d.hub.publish(`user:${user.toLowerCase()}`, (topic) => ({ type: "tx", topic, tx }));
  }

  async tick() {
    const ops = this.d.ops;
    if (this.ticking || !ops) return;
    this.ticking = true;
    try {
      for (const a of this.d.store.toCheck(HOT_PER_TICK, COLD_PER_TICK)) {
        let reqs;
        try {
          reqs = await this.d.relay.byDepositAddress(a.address);
        } catch (e) {
          log("deposit.poll_error", { address: a.address, error: errMessage(e) });
          continue;
        }
        this.d.store.checked(a.address);
        for (const r of reqs) {
          if (this.d.store.fill(r.id)) continue;
          if (r.status === "refund") {
            this.d.store.addFill({ requestId: r.id, user: a.user, chainId: a.chain_id, address: a.address, usdc: 0n, status: "refunded" });
            this.pushTx(a.user, { id: r.id, kind: "bridge", status: "failed", hash: null, error: "relay refunded the deposit on its own chain" });
            continue;
          }
          if (r.status !== "success") continue;
          const usdc = amountOut(r, ops.address, BASE_USDC);
          if (!usdc) {
            log("deposit.unreadable", { requestId: r.id });
            continue;
          }
          this.d.store.addFill({ requestId: r.id, user: a.user, chainId: a.chain_id, address: a.address, usdc, status: "pending" });
          this.pushTx(a.user, { id: r.id, kind: "bridge", status: "pending", hash: null, error: null });
        }
      }
      await this.creditPending();
    } finally {
      this.ticking = false;
    }
  }

  async creditPending() {
    const ops = this.d.ops;
    if (!ops) return;
    for (const f of this.d.store.pendingFills()) await this.credit(f, ops);
  }

  private async credit(f: FillRow, ops: MezoOps) {
    if (this.crediting.has(f.request_id)) return;
    this.crediting.add(f.request_id);
    try {
      if (f.status === "sent" && f.hash) {
        const ok = (await this.d.receipt?.(f.hash as Hash)) ?? null;
        if (ok === null) return;
        this.done(f, f.hash as Hash, ok, ok ? null : "reverted");
        return;
      }
      const musd = BigInt(f.usdc) * USDC_TO_MUSD;
      const out = await ops.deposit(musd, f.user as Address, (hash) => {
        this.d.store.setFill(f.request_id, "sent", hash);
        this.pushTx(f.user, { id: f.request_id, kind: "bridge", status: "pending", hash, error: null });
      });
      this.done(f, out.hash, out.ok, out.error);
    } catch (e) {
      log("deposit.credit_error", { requestId: f.request_id, error: errMessage(e) });
    } finally {
      this.crediting.delete(f.request_id);
    }
  }

  private done(f: FillRow, hash: Hash, ok: boolean, error: string | null) {
    this.d.store.setFill(f.request_id, ok ? "confirmed" : "failed", hash, error);
    this.pushTx(f.user, { id: f.request_id, kind: "bridge", status: ok ? "confirmed" : "failed", hash, error });
    log("deposit.credited", { requestId: f.request_id, user: f.user, usdc: f.usdc, ok, hash });
  }
}

import { zeroAddress, type Address, type Chain, type PublicClient, type Transport } from "viem";
import { poolAbi, poolFactoryAbi, type Deployment } from "shared";
import { log } from "./log";
import type { PriceBook } from "./price-book";
import { poolPrice } from "./pricing";
import { readMany } from "./reads";
import type { Store, TokenRow } from "./store";
import type { Views } from "./views";

export interface PriceMove {
  address: Address;
  priceMusd: string;
  change24h: number;
}

export const POOL_RECHECK_BLOCKS = 50;

type Reserves = readonly [bigint, bigint, bigint];

export class Pricer {
  private token0 = new Map<string, string>();
  private looked = new Map<string, number>();
  private published = new Map<string, bigint>();

  constructor(
    private pub: PublicClient<Transport, Chain>,
    private store: Store,
    private book: PriceBook,
    private views: Views,
    private dep: Deployment,
  ) {}

  poke(token: string) {
    this.looked.delete(token.toLowerCase());
  }

  private musdReserve(pool: string, res: Reserves | null | undefined): bigint {
    const t0 = this.token0.get(pool);
    if (!res || !t0 || res[0] === 0n || res[1] === 0n) return 0n;
    return t0 === this.dep.musd.toLowerCase() ? res[0] : res[1];
  }

  // same rule as MusdyVault.poolFor: stable only when its MUSD side is deeper, else volatile if both its sides are non zero
  private async resolvePools(rows: TokenRow[], block: number) {
    const due = rows.filter((r) => {
      const at = this.looked.get(r.address);
      return at === undefined || block - at >= POOL_RECHECK_BLOCKS;
    });
    if (!due.length) return;
    const call = (r: TokenRow, stable: boolean) =>
      ({ address: this.dep.factory, abi: poolFactoryAbi, functionName: "getPool", args: [r.address as Address, this.dep.musd, stable] }) as const;
    const volatile = await readMany<Address>(this.pub, due.map((r) => call(r, false)));
    const stable = await readMany<Address>(this.pub, due.map((r) => call(r, true)));
    const live = (p: Address | null | undefined) => (p && p !== zeroAddress ? p.toLowerCase() : null);
    const pools = [...new Set(due.flatMap((_, i) => [live(volatile[i]), live(stable[i])]).filter((p): p is string => !!p))];
    await this.resolveToken0(pools);
    const reserves = await readMany<Reserves>(this.pub, pools.map((p) => ({ address: p as Address, abi: poolAbi, functionName: "getReserves" }) as const));
    const depth = new Map(pools.map((p, i) => [p, this.musdReserve(p, reserves[i])]));
    due.forEach((r, i) => {
      if (volatile[i] === null || stable[i] === null) return;
      this.looked.set(r.address, block);
      const v = live(volatile[i]);
      const st = live(stable[i]);
      const vd = v ? (depth.get(v) ?? 0n) : 0n;
      const sd = st ? (depth.get(st) ?? 0n) : 0n;
      const pool = sd > vd ? st : vd > 0n ? v : null;
      if (pool && pool !== r.pool) {
        this.store.setPool(r.address, pool);
        log("prices.pool", { token: r.address, pool, musdReserve: (sd > vd ? sd : vd).toString() });
        r.pool = pool;
      }
    });
  }

  private async resolveToken0(pools: string[]) {
    const missing = pools.filter((p) => !this.token0.has(p));
    const res = await readMany<Address>(
      this.pub,
      missing.map((p) => ({ address: p as Address, abi: poolAbi, functionName: "token0" }) as const),
    );
    missing.forEach((p, i) => {
      const t0 = res[i];
      if (t0) this.token0.set(p, t0.toLowerCase());
    });
  }

  pendingPoolless(): number {
    return this.store.tokens().filter((r) => !r.pool && this.looked.has(r.address)).length;
  }

  async tick(block: number, ts: number): Promise<PriceMove[]> {
    const rows = this.store.tokens().filter((r) => r.kind !== "musd" && r.kind !== "meme");
    const poolRows = rows.filter((r) => !(r.kind === "launch" && !r.graduated));
    await this.resolvePools(poolRows, block);
    const priced = poolRows.filter((r) => r.pool);
    await this.resolveToken0(priced.map((r) => r.pool!));
    const reserves = await readMany<Reserves>(
      this.pub,
      priced.map((r) => ({ address: r.pool as Address, abi: poolAbi, functionName: "getReserves" }) as const),
    );
    priced.forEach((r, i) => {
      const res = reserves[i];
      const t0 = this.token0.get(r.pool!);
      if (!res || !t0 || res[0] === 0n || res[1] === 0n) return;
      const price = poolPrice(r.address, t0, res[0], res[1], r.decimals);
      if (price !== null && this.book.latest(r.address) !== price) this.book.record(r.address, ts, block, price);
    });

    const moves: PriceMove[] = [];
    for (const r of rows) {
      const price = this.views.priceOf(r);
      if (price === 0n || this.published.get(r.address) === price) continue;
      this.published.set(r.address, price);
      moves.push({ address: this.views.tokenRef(r.address).address as Address, priceMusd: price.toString(), change24h: this.book.change24h(r.address, ts) });
    }
    if (moves.length) log("prices.moved", { block, count: moves.length });
    return moves;
  }
}

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

// once per block: pool reserves for pool tokens, virtual reserves (kept by the indexer) for curve tokens
export class Pricer {
  private token0 = new Map<string, string>();
  private published = new Map<string, bigint>();

  constructor(
    private pub: PublicClient<Transport, Chain>,
    private store: Store,
    private book: PriceBook,
    private views: Views,
    private dep: Deployment,
  ) {}

  private async resolvePools(rows: TokenRow[]) {
    const missing = rows.filter((r) => !r.pool);
    if (!missing.length) return;
    const call = (r: TokenRow, stable: boolean) =>
      ({ address: this.dep.factory, abi: poolFactoryAbi, functionName: "getPool", args: [r.address as Address, this.dep.musd, stable] }) as const;
    const volatile = await readMany<Address>(this.pub, missing.map((r) => call(r, false)));
    const stable = await readMany<Address>(this.pub, missing.map((r) => call(r, true)));
    missing.forEach((r, i) => {
      const pool = [volatile[i], stable[i]].find((p) => p && p !== zeroAddress);
      if (pool) {
        this.store.setPool(r.address, pool);
        r.pool = pool.toLowerCase();
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

  async tick(block: number, ts: number): Promise<PriceMove[]> {
    const rows = this.store.tokens().filter((r) => r.kind !== "musd");
    const poolRows = rows.filter((r) => !(r.kind === "launch" && !r.graduated));
    await this.resolvePools(poolRows);
    const priced = poolRows.filter((r) => r.pool);
    await this.resolveToken0(priced.map((r) => r.pool!));
    const reserves = await readMany<readonly [bigint, bigint, bigint]>(
      this.pub,
      priced.map((r) => ({ address: r.pool as Address, abi: poolAbi, functionName: "getReserves" }) as const),
    );
    priced.forEach((r, i) => {
      const res = reserves[i];
      const t0 = this.token0.get(r.pool!);
      if (!res || !t0) return;
      const price = poolPrice(r.address, t0, res[0], res[1], r.decimals);
      if (price !== null && this.book.latest(r.address) !== price) this.book.record(r.address, ts, block, price);
    });

    const moves: PriceMove[] = [];
    for (const r of rows) {
      const price = this.views.priceOf(r);
      if (price === 0n || this.published.get(r.address) === price) continue;
      this.published.set(r.address, price);
      moves.push({ address: this.views.tokenRef(r.address).address, priceMusd: price.toString(), change24h: this.book.change24h(r.address, ts) });
    }
    if (moves.length) log("prices.moved", { block, count: moves.length });
    return moves;
  }
}

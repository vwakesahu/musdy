import { erc20Abi, type Chain, type PublicClient, type Transport } from "viem";
import { launchpadAbi, vaultAbi, VENUES, type Deployment } from "shared";
import { log } from "./log";
import type { PriceBook } from "./price-book";
import { curvePrice, toFloat, tradePrice } from "./pricing";
import type { Store, TradeRow } from "./store";

const isEvent = <T extends { type: string }>(x: T): x is Extract<T, { type: "event" }> => x.type === "event";
const events = [...vaultAbi.filter(isEvent), ...launchpadAbi.filter(isEvent)];

export interface IndexerDeps {
  pub: PublicClient<Transport, Chain>;
  store: Store;
  book: PriceBook;
  dep: Deployment;
  launchTotalSupply: bigint;
  chunk?: number;
  // only called for rows that were new, and only once the block range is committed
  onTrade?(row: TradeRow): void;
  onToken?(address: string): void;
  // MUSD value of a token amount at a time, what a token deposit enters a position at
  valueAt?(token: string, amount: bigint, ts: number): bigint;
}

type Curve = { virtualMusd: bigint; virtualToken: bigint; tokensSold: bigint };
type Meta = { symbol: string; name: string; decimals: number };

export class Indexer {
  private chunk: number;
  private vault: string;
  private launchpad: string;
  private musd: string;
  private tsCache = new Map<bigint, number>();

  constructor(private d: IndexerDeps) {
    this.chunk = d.chunk ?? 2000;
    this.vault = d.dep.vault.toLowerCase();
    this.launchpad = d.dep.launchpad.toLowerCase();
    this.musd = d.dep.musd.toLowerCase();
  }

  lastBlock(): number {
    const v = this.d.store.getMeta("last_block");
    return v === null ? this.d.dep.startBlock - 1 : Number(v);
  }

  async syncTo(head: number): Promise<number> {
    let from = this.lastBlock() + 1;
    let total = 0;
    while (from <= head) {
      const to = Math.min(head, from + this.chunk - 1);
      total += await this.range(from, to);
      from = to + 1;
    }
    return total;
  }

  private async blockTs(n: bigint): Promise<number> {
    const hit = this.tsCache.get(n);
    if (hit !== undefined) return hit;
    const b = await this.d.pub.getBlock({ blockNumber: n });
    const ts = Number(b.timestamp);
    if (this.tsCache.size > 5000) this.tsCache.clear();
    this.tsCache.set(n, ts);
    return ts;
  }

  private async curveAt(token: `0x${string}`, blockNumber: bigint): Promise<Curve> {
    const read = (bn?: bigint) =>
      this.d.pub.readContract({ address: this.d.dep.launchpad, abi: launchpadAbi, functionName: "curveOf", args: [token], blockNumber: bn });
    try {
      return await read(blockNumber);
    } catch (e) {
      // non archive rpc, fall back to the latest state which shares the same k
      log("indexer.curve_fallback", { token, error: e instanceof Error ? e.message : String(e) });
      return await read();
    }
  }

  private async tokenMeta(token: `0x${string}`): Promise<Meta> {
    const base = { address: token, abi: erc20Abi } as const;
    const [symbol, name, decimals] = await Promise.all([
      this.d.pub.readContract({ ...base, functionName: "symbol" }),
      this.d.pub.readContract({ ...base, functionName: "name" }),
      this.d.pub.readContract({ ...base, functionName: "decimals" }),
    ]);
    return { symbol, name, decimals };
  }

  private async range(from: number, to: number): Promise<number> {
    const logs = await this.d.pub.getLogs({
      address: [this.d.dep.vault, this.d.dep.launchpad],
      events,
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
      strict: true,
    });
    logs.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);

    // async lookups first, then one synchronous transaction
    const ts = new Map<bigint, number>();
    for (const n of new Set(logs.map((l) => l.blockNumber))) ts.set(n, await this.blockTs(n));
    const curves = new Map<string, Curve>();
    const metas = new Map<string, Meta>();
    for (const l of logs) {
      if (l.eventName === "TokenCreated" && l.address.toLowerCase() === this.launchpad)
        curves.set(l.args.token.toLowerCase(), await this.curveAt(l.args.token, l.blockNumber));
      if (l.eventName === "Traded" || l.eventName === "Deposited" || l.eventName === "Withdrawn") {
        const t = l.args.token.toLowerCase();
        const created = logs.some((x) => x.eventName === "TokenCreated" && x.args.token.toLowerCase() === t);
        if (!created && !metas.has(t) && !this.d.store.token(t)) metas.set(t, await this.tokenMeta(l.args.token));
      }
    }

    const newTrades: TradeRow[] = [];
    const touched = new Set<string>();
    const { store, book } = this.d;
    store.tx(() => {
      for (const [address, m] of metas)
        store.seedToken({ address, symbol: m.symbol, name: m.name, decimals: m.decimals, kind: "other", createdAt: ts.get(logs[0]!.blockNumber) ?? 0 });
      for (const l of logs) {
        const id = `${l.transactionHash}:${l.logIndex}`;
        const block = Number(l.blockNumber);
        const at = ts.get(l.blockNumber) ?? 0;
        const src = l.address.toLowerCase();
        if (src === this.vault) {
          if (l.eventName === "Traded") {
            const a = l.args;
            const token = store.token(a.token);
            const decimals = token?.decimals ?? 18;
            const price = tradePrice(a.isBuy, a.musdAmount, a.fee, a.tokenAmount, decimals);
            const venue = VENUES[a.venue];
            if (!venue) throw new Error(`unknown venue ${a.venue} in ${id}`);
            const row: TradeRow = {
              id,
              block,
              log_index: l.logIndex,
              ts: at,
              tx_hash: l.transactionHash,
              user: a.user.toLowerCase(),
              token: a.token.toLowerCase(),
              is_buy: a.isBuy ? 1 : 0,
              musd_amount: a.musdAmount.toString(),
              token_amount: a.tokenAmount.toString(),
              fee: a.fee.toString(),
              ref: a.ref.toLowerCase(),
              venue,
              price: price.toString(),
              price_f: toFloat(price),
              musd_f: toFloat(a.musdAmount),
            };
            if (store.insertTrade(row)) {
              if (price > 0n && venue === "pool") book.record(row.token, at, block, price);
              newTrades.push(row);
            }
          } else if (l.eventName === "Deposited" || l.eventName === "Withdrawn") {
            const a = l.args;
            const isNew = store.insertTransfer({
              id,
              block,
              log_index: l.logIndex,
              ts: at,
              kind: l.eventName === "Deposited" ? "deposit" : "withdraw",
              user: a.user,
              token: a.token,
              amount: a.amount.toString(),
              to_addr: l.eventName === "Withdrawn" ? l.args.to : null,
            });
            // MUSD is cash, only other tokens make a position
            if (isNew && a.token.toLowerCase() !== this.musd) {
              const deposit = l.eventName === "Deposited";
              store.applyFlow(a.user, a.token, { kind: deposit ? "in" : "out", amount: a.amount, musd: deposit ? (this.d.valueAt?.(a.token, a.amount, at) ?? 0n) : 0n });
            }
          } else if (l.eventName === "Launched") {
            store.insertLaunch(id, block, at, l.args.user, l.args.token);
          }
        } else if (src === this.launchpad) {
          if (l.eventName === "TokenCreated") {
            const a = l.args;
            const c = curves.get(a.token.toLowerCase());
            if (!c) continue;
            // rebuild the starting curve from k, the curve may already have trades in this block
            const vt0 = c.virtualToken + c.tokensSold;
            const vm0 = (c.virtualMusd * c.virtualToken) / vt0;
            const isNew = store.insertLaunchToken({
              address: a.token,
              symbol: a.symbol,
              name: a.name,
              image: a.image,
              creator: a.creator,
              createdAt: at,
              virtualMusd: vm0,
              virtualToken: vt0,
              totalSupply: this.d.launchTotalSupply,
            });
            if (isNew) {
              const p = curvePrice(vm0, vt0);
              if (p !== null) book.record(a.token, at, block, p);
              touched.add(a.token.toLowerCase());
            }
          } else if (l.eventName === "CurveTrade") {
            const a = l.args;
            const isNew = store.insertCurveTrade({
              id,
              block,
              logIndex: l.logIndex,
              ts: at,
              token: a.token,
              trader: a.trader,
              isBuy: a.isBuy,
              musdAmount: a.musdAmount,
              tokenAmount: a.tokenAmount,
              virtualMusd: a.virtualMusd,
              virtualToken: a.virtualToken,
            });
            if (isNew) {
              store.setCurve(a.token, a.virtualMusd, a.virtualToken);
              const p = curvePrice(a.virtualMusd, a.virtualToken);
              if (p !== null) book.record(a.token, at, block, p);
              touched.add(a.token.toLowerCase());
            }
          } else if (l.eventName === "Graduated") {
            const a = l.args;
            const isNew = store.insertGraduation({ id, block, ts: at, token: a.token, pool: a.pool, musd: a.musdLiquidity, tokens: a.tokenLiquidity });
            if (isNew) {
              store.graduate(a.token, a.pool);
              touched.add(a.token.toLowerCase());
            }
          }
        }
      }
      store.setMeta("last_block", String(to));
    });

    if (logs.length) log("indexer.range", { from, to, logs: logs.length, trades: newTrades.length });
    for (const row of newTrades) this.d.onTrade?.(row);
    for (const t of touched) this.d.onToken?.(t);
    return logs.length;
  }
}

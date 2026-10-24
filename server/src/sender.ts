import {
  BaseError,
  encodeFunctionData,
  HttpRequestError,
  keccak256,
  SocketClosedError,
  TimeoutError,
  TransactionNotFoundError,
  WebSocketRequestError,
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type Transport,
} from "viem";
import type { Wallet } from "./chain";
import { errMessage, log } from "./log";

export interface Fees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}
export type SendFn = (nonce: number, fees?: Fees) => Promise<Hex>;

export interface CallRequest {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas: bigint;
  nonce: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export const signCall = async (wallet: Wallet, r: CallRequest): Promise<Hex> => {
  const data = encodeFunctionData({ abi: r.abi as Abi, functionName: r.functionName, args: r.args } as Parameters<typeof encodeFunctionData>[0]);
  const fees = r.maxFeePerGas !== undefined ? { maxFeePerGas: r.maxFeePerGas, maxPriorityFeePerGas: r.maxPriorityFeePerGas } : {};
  const tx = await wallet.prepareTransactionRequest({ to: r.address, data, value: r.value, gas: r.gas, nonce: r.nonce, ...fees });
  return wallet.signTransaction(tx as Parameters<Wallet["signTransaction"]>[0]);
};

export const ambiguous = (e: unknown): boolean => {
  const transport = (x: unknown) =>
    x instanceof HttpRequestError || x instanceof TimeoutError || x instanceof WebSocketRequestError || x instanceof SocketClosedError;
  if (e instanceof BaseError) return !!e.walk(transport);
  return transport(e) || /fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|timed? ?out/i.test(e instanceof Error ? e.message : String(e));
};

export interface SenderOpts {
  stuckMs?: number;
  watchMs?: number;
  maxBumps?: number;
}

interface Pending {
  nonce: number;
  // cancels stay out of hashes so a mined cancel reads as the tx dropped, never as it confirming
  hashes: Hash[];
  cancels: Hash[];
  send: SendFn;
  at: number;
  bumps: number;
}

// a replacement must beat the old fee by at least 10%, use 25%
const bump = (v: bigint) => (v * 125n) / 100n + 1n;
const max = (...xs: bigint[]) => xs.reduce((a, b) => (a > b ? a : b));

export class Sender {
  private queue: Promise<unknown> = Promise.resolve();
  private nonce: number | null = null;
  private pending = new Map<number, Pending>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private opts: Required<SenderOpts>;

  constructor(
    readonly wallet: Wallet,
    private pub: PublicClient<Transport, Chain>,
    readonly name: string,
    opts: SenderOpts = {},
  ) {
    this.opts = { stuckMs: 30_000, watchMs: 5_000, maxBumps: 5, ...opts };
  }

  get address() {
    return this.wallet.account.address;
  }

  submit(send: SendFn): Promise<Hash> {
    const attempt = async (): Promise<Hash> => {
      if (this.nonce === null) this.nonce = await this.pub.getTransactionCount({ address: this.address, blockTag: "pending" });
      const nonce = this.nonce;
      try {
        const raw = await send(nonce);
        const hash = await this.broadcast(raw);
        this.nonce = nonce + 1;
        this.pending.set(nonce, { nonce, hashes: [hash], cancels: [], send, at: Date.now(), bumps: 0 });
        log("sender.sent", { sender: this.name, nonce, hash });
        return hash;
      } catch (e) {
        this.nonce = null;
        throw e;
      }
    };
    // nonce too low means something else spent our cached nonce and this tx never entered the pool, so resync once
    const run = async () => {
      try {
        return await attempt();
      } catch (e) {
        if (!nonceTooLow(e)) throw e;
        log("sender.nonce_resync", { sender: this.name });
        return attempt();
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  // a lost answer keeps the hash, the tx may still mine and receipts plus the account nonce settle it
  private async broadcast(raw: Hex): Promise<Hash> {
    const hash = keccak256(raw);
    try {
      await this.wallet.sendRawTransaction({ serializedTransaction: raw });
    } catch (e) {
      if (!ambiguous(e)) throw e;
      log("sender.send_ambiguous", { sender: this.name, hash, error: errMessage(e) });
    }
    return hash;
  }

  private async cancelTx(nonce: number, fees: Fees): Promise<Hex> {
    const tx = await this.wallet.prepareTransactionRequest({ to: this.address, value: 0n, gas: 21_000n, nonce, ...fees });
    return this.wallet.signTransaction(tx as Parameters<Wallet["signTransaction"]>[0]);
  }

  cancelsFor(hash: Hash): Hash[] {
    return this.entry(hash)?.cancels.slice() ?? [];
  }

  private entry(hash: Hash): Pending | null {
    for (const e of this.pending.values()) if (e.hashes.includes(hash)) return e;
    return null;
  }

  hashesFor(hash: Hash): Hash[] {
    return this.entry(hash)?.hashes.slice() ?? [hash];
  }

  nonceOf(hash: Hash): number | null {
    return this.entry(hash)?.nonce ?? null;
  }

  minedCount(): Promise<number> {
    return this.pub.getTransactionCount({ address: this.address, blockTag: "latest" });
  }

  forget(hash: Hash) {
    const e = this.entry(hash);
    if (e) this.pending.delete(e.nonce);
  }

  start() {
    this.timer ??= setInterval(() => void this.watchdog(), this.opts.watchMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async fees(last: Hash): Promise<Fees> {
    const est = await this.pub.estimateFeesPerGas();
    let prevMax = 0n;
    let prevTip = 0n;
    try {
      const tx = await this.pub.getTransaction({ hash: last });
      prevMax = tx.maxFeePerGas ?? tx.gasPrice ?? 0n;
      prevTip = tx.maxPriorityFeePerGas ?? tx.gasPrice ?? 0n;
    } catch (e) {
      if (!(e instanceof TransactionNotFoundError)) throw e;
    }
    const tip = max(bump(prevTip), est.maxPriorityFeePerGas);
    return { maxFeePerGas: max(bump(prevMax), est.maxFeePerGas, tip), maxPriorityFeePerGas: tip };
  }

  async watchdog(): Promise<Hash[]> {
    if (this.ticking || !this.pending.size) return [];
    this.ticking = true;
    const sent: Hash[] = [];
    try {
      const mined = await this.minedCount();
      const now = Date.now();
      for (const e of [...this.pending.values()].sort((a, b) => a.nonce - b.nonce)) {
        if (e.nonce < mined) {
          if (now - e.at > 600_000) this.pending.delete(e.nonce);
          continue;
        }
        if (now - e.at < this.opts.stuckMs) continue;
        const cancel = e.bumps >= this.opts.maxBumps;
        if (cancel && e.cancels.length >= this.opts.maxBumps) continue;
        try {
          const fees = await this.fees((cancel && e.cancels.at(-1)) || e.hashes.at(-1)!);
          const hash = await this.broadcast(cancel ? await this.cancelTx(e.nonce, fees) : await e.send(e.nonce, fees));
          if (cancel) e.cancels.push(hash);
          else {
            e.hashes.push(hash);
            e.bumps++;
          }
          e.at = Date.now();
          sent.push(hash);
          log(cancel ? "sender.cancelled" : "sender.replaced", {
            sender: this.name,
            nonce: e.nonce,
            hash,
            maxFeePerGas: fees.maxFeePerGas.toString(),
            bumps: e.bumps,
            cancels: e.cancels.length,
          });
        } catch (err) {
          e.at = Date.now();
          log("sender.replace_failed", { sender: this.name, nonce: e.nonce, error: errMessage(err) });
        }
      }
    } catch (err) {
      log("sender.watchdog_error", { sender: this.name, error: errMessage(err) });
    } finally {
      this.ticking = false;
    }
    return sent;
  }
}

const nonceTooLow = (e: unknown) => /nonce too low|nonce has already been used/i.test(errMessage(e));

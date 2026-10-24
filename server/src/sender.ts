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
// signs one tx at `nonce` locally and returns the raw tx, the sender broadcasts it.
// fees are only set when the watchdog replaces a stuck tx
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

// a contract call signed by the wallet's local key, nothing is sent
export const signCall = async (wallet: Wallet, r: CallRequest): Promise<Hex> => {
  const data = encodeFunctionData({ abi: r.abi as Abi, functionName: r.functionName, args: r.args } as Parameters<typeof encodeFunctionData>[0]);
  const fees = r.maxFeePerGas !== undefined ? { maxFeePerGas: r.maxFeePerGas, maxPriorityFeePerGas: r.maxPriorityFeePerGas } : {};
  const tx = await wallet.prepareTransactionRequest({ to: r.address, data, value: r.value, gas: r.gas, nonce: r.nonce, ...fees });
  return wallet.signTransaction(tx as Parameters<Wallet["signTransaction"]>[0]);
};

// a send error is ambiguous when the node may have taken the tx before the answer was lost
export const ambiguous = (e: unknown): boolean => {
  const transport = (x: unknown) =>
    x instanceof HttpRequestError || x instanceof TimeoutError || x instanceof WebSocketRequestError || x instanceof SocketClosedError;
  if (e instanceof BaseError) return !!e.walk(transport);
  return transport(e) || /fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|timed? ?out/i.test(e instanceof Error ? e.message : String(e));
};

export interface SenderOpts {
  // a tx still unmined after this long gets replaced at a higher fee
  stuckMs?: number;
  watchMs?: number;
  maxBumps?: number;
}

interface Pending {
  nonce: number;
  hashes: Hash[];
  send: SendFn;
  at: number;
  bumps: number;
}

// a replacement must beat the old fee by at least 10%, use 25%
const bump = (v: bigint) => (v * 125n) / 100n + 1n;
const max = (...xs: bigint[]) => xs.reduce((a, b) => (a > b ? a : b));

// one account, one queue. nonces are handed out in order and resynced from the chain after any send error.
// a watchdog replaces a nonce that sits unmined at a higher fee, every hash sent for a nonce stays tracked.
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
    const run = async () => {
      if (this.nonce === null) this.nonce = await this.pub.getTransactionCount({ address: this.address, blockTag: "pending" });
      const nonce = this.nonce;
      try {
        const raw = await send(nonce);
        const hash = await this.broadcast(raw);
        this.nonce = nonce + 1;
        this.pending.set(nonce, { nonce, hashes: [hash], send, at: Date.now(), bumps: 0 });
        log("sender.sent", { sender: this.name, nonce, hash });
        return hash;
      } catch (e) {
        this.nonce = null;
        throw e;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  // the hash is known before sending. a definitive rejection throws, a lost answer keeps the hash:
  // the tx may still mine, receipts and the account nonce settle it and the watchdog resends it if it never landed
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

  private entry(hash: Hash): Pending | null {
    for (const e of this.pending.values()) if (e.hashes.includes(hash)) return e;
    return null;
  }

  // every hash sent for the same nonce as `hash`, oldest first
  hashesFor(hash: Hash): Hash[] {
    return this.entry(hash)?.hashes.slice() ?? [hash];
  }

  // the account nonce `hash` was sent with, null once it is no longer tracked
  nonceOf(hash: Hash): number | null {
    return this.entry(hash)?.nonce ?? null;
  }

  // how many txs the chain has mined from this account
  minedCount(): Promise<number> {
    return this.pub.getTransactionCount({ address: this.address, blockTag: "latest" });
  }

  // tracking ends once the tx is settled
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
      // dropped from the mempool, resend at the market fee
      if (!(e instanceof TransactionNotFoundError)) throw e;
    }
    const tip = max(bump(prevTip), est.maxPriorityFeePerGas);
    return { maxFeePerGas: max(bump(prevMax), est.maxFeePerGas, tip), maxPriorityFeePerGas: tip };
  }

  // replaces every tracked nonce that has sat unmined for stuckMs, returns the new hashes
  async watchdog(): Promise<Hash[]> {
    if (this.ticking || !this.pending.size) return [];
    this.ticking = true;
    const sent: Hash[] = [];
    try {
      const mined = await this.minedCount();
      const now = Date.now();
      for (const e of [...this.pending.values()].sort((a, b) => a.nonce - b.nonce)) {
        if (e.nonce < mined) {
          // nobody settled it, stop tracking well after it mined
          if (now - e.at > 600_000) this.pending.delete(e.nonce);
          continue;
        }
        if (now - e.at < this.opts.stuckMs || e.bumps >= this.opts.maxBumps) continue;
        try {
          const fees = await this.fees(e.hashes[e.hashes.length - 1]!);
          const hash = await this.broadcast(await e.send(e.nonce, fees));
          e.hashes.push(hash);
          e.bumps++;
          e.at = Date.now();
          sent.push(hash);
          log("sender.replaced", { sender: this.name, nonce: e.nonce, hash, maxFeePerGas: fees.maxFeePerGas.toString(), bumps: e.bumps });
        } catch (err) {
          // usually the old tx mined meanwhile, the next round sees the nonce pass
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

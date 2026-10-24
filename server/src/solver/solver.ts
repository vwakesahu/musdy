import type { Address, Hash } from "viem";
import { SOLANA, type TxStatus } from "shared";
import { HttpError } from "../errors";
import type { Hub } from "../hub";
import { errMessage, log } from "../log";
import type { PriceBook } from "../price-book";
import { toFloat, tradePrice } from "../pricing";
import type { TradeRow } from "../store";
import type { Views } from "../views";
import { BASE, BASE_USDC, coinAddress, USDC_TO_MUSD } from "./config";
import type { StepRunner } from "./exec";
import type { MezoOps } from "./mezo";
import { amountOut, type Quote, type QuoteParams, type RelayApi } from "./relay";
import { xKey, type IntentRow, type SolverStore } from "./store";

export interface IntentEvent {
  kind: "opened" | "settled";
  id: Hash;
  user: Address;
  txHash: Hash;
  block: number;
  logIndex: number;
  ts: number;
  isBuy?: boolean;
  chainId?: number;
  token?: string;
  amountIn?: bigint;
  minOut?: bigint;
  ref?: Address;
  musdToUser?: bigint;
  tokenAmount?: bigint;
  ok?: boolean;
}

export interface IntentAsk {
  user: Address;
  isBuy: boolean;
  chainId: number;
  token: string;
  amountIn: bigint;
}

export interface SolverDeps {
  relay: RelayApi;
  runner: StepRunner;
  ops: MezoOps;
  store: SolverStore;
  views: Views;
  book: PriceBook;
  hub: Hub;
  pollMs?: number;
  autoGas?: boolean;
  waitingMs?: number;
  fillMs?: number;
}

const GAS_MIN: Record<number, bigint> = { 56: 300_000_000_000_000n, [SOLANA]: 5_000_000n };
const GAS_TOPUP_USDC = "500000";
const DROP_AFTER_S = 120;
export const MIN_BUY_MUSD = 10n ** 18n;
const RETRY_MS = 30_000;

class Fail extends Error {}

export class Solver {
  private running = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private fee: bigint | null = null;

  constructor(private d: SolverDeps) {}

  async start() {
    this.fee = BigInt(await this.d.ops.feeBps());
    this.timer = setInterval(() => this.resume(), RETRY_MS);
    this.resume();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private resume() {
    for (const row of this.d.store.unfinished()) this.kick(row.id);
  }

  // checked before the relayer spends gas on executeIntent
  async check(i: IntentAsk) {
    const token = coinAddress(i.chainId, i.token);
    if (!token) throw new HttpError(400, "bad_token", `not a coin address on chain ${i.chainId} (solana, base and bsc are supported)`);
    if (i.chainId === SOLANA && !this.d.runner.solanaAddress) throw new HttpError(503, "solver_off", "solana trading is off, the server has no SOLVER_SOLANA_KEY");
    if (i.isBuy && i.amountIn < MIN_BUY_MUSD) throw new HttpError(400, "too_small", "a cross chain buy needs at least 1 MUSD");
    if (!i.isBuy) {
      const free = this.d.store.held(i.user, i.chainId, token) - this.d.store.reservedSells(i.user, i.chainId, token);
      if (free < i.amountIn) throw new HttpError(400, "insufficient_position", "you hold less of this coin than you are selling");
      const min = GAS_MIN[i.chainId];
      if (min !== undefined && !this.d.autoGas) {
        const bal = await this.d.runner.nativeBalance(i.chainId).catch(() => null);
        if (bal !== null && bal < min) throw new HttpError(503, "sell_no_gas", `selling coins on ${i.chainId === SOLANA ? "Solana" : "BNB Chain"} opens once the solver has gas there`);
      }
    }
  }

  onEvent(ev: IntentEvent) {
    if (ev.kind === "opened") {
      const token = coinAddress(ev.chainId!, ev.token!) ?? ev.token!;
      this.d.store.openIntent({ id: ev.id, user: ev.user, isBuy: ev.isBuy!, chainId: ev.chainId!, token, amountIn: ev.amountIn!, minOut: ev.minOut!, ref: ev.ref!, at: ev.ts });
      this.kick(ev.id);
      return;
    }
    this.closed(ev);
  }

  private pushTx(user: string, tx: TxStatus) {
    this.d.hub.publish(`user:${user.toLowerCase()}`, (topic) => ({ type: "tx", topic, tx }));
  }

  private closed(ev: IntentEvent) {
    const row = this.d.store.intent(ev.id);
    if (!row || row.status === "settled" || row.status === "refunded") return;
    const s = this.d.store;
    if (ev.ok) {
      const isBuy = row.is_buy === 1;
      const key = xKey(row.chain_id, row.token);
      const decimals = s.store.token(key)?.decimals ?? 18;
      const musd = isBuy ? BigInt(row.amount_in) : ev.musdToUser!;
      const tokens = isBuy ? ev.tokenAmount! : BigInt(row.amount_in);
      const fee = BigInt(row.fee);
      const price = tradePrice(isBuy, musd, fee, tokens, decimals);
      const listed = this.d.views.marketCoin?.({ chainId: row.chain_id, address: row.token }) ?? null;
      const trade: TradeRow = {
        id: `${ev.txHash}:${ev.logIndex}`,
        block: ev.block,
        log_index: ev.logIndex,
        ts: ev.ts,
        tx_hash: ev.txHash,
        user: row.user,
        token: key,
        is_buy: isBuy ? 1 : 0,
        musd_amount: musd.toString(),
        token_amount: tokens.toString(),
        fee: fee.toString(),
        ref: row.ref,
        venue: "relay",
        price: price.toString(),
        price_f: toFloat(price),
        musd_f: toFloat(musd),
        market_cap: listed && listed.marketCapMusd !== "0" ? listed.marketCapMusd : null,
      };
      const fresh = s.store.tx(() => {
        if (listed) s.brand(key, listed);
        s.update(row.id, { status: "settled" });
        return s.store.insertTrade(trade);
      });
      if (fresh) {
        if (price > 0n) this.d.book.record(key, ev.ts, ev.block, price);
        this.d.hub.publishTrade(this.d.views.feedItem(trade), s.store.followers(row.user));
      }
    } else s.update(row.id, { status: "refunded", error: row.error ?? "refunded" });
    this.pushTx(row.user, { id: row.id, kind: "intent", status: ev.ok ? "confirmed" : "failed", hash: ev.txHash, error: ev.ok ? null : (row.error ?? "refunded") });
    log("solver.closed", { id: row.id, ok: ev.ok });
  }

  private kick(id: string) {
    if (this.stopped || this.running.has(id)) return;
    this.running.add(id);
    void this.drive(id)
      .catch((e: unknown) => log("solver.error", { id, error: errMessage(e) }))
      .finally(() => this.running.delete(id));
  }

  private recipient(row: IntentRow): string {
    if (!row.is_buy) return this.d.runner.evmAddress;
    if (row.chain_id !== SOLANA) return this.d.runner.evmAddress;
    const sol = this.d.runner.solanaAddress;
    if (!sol) throw new Fail("solana trading is off, the server has no SOLVER_SOLANA_KEY");
    return sol;
  }

  // sells send a tx on the coin's own chain, so the solver keeps a little native gas there, bought from base usdc through relay
  private async ensureGas(chainId: number) {
    const min = GAS_MIN[chainId];
    const bal = await this.d.runner.nativeBalance(chainId);
    if (min === undefined || bal === null || bal >= min) return;
    if (!this.d.autoGas) throw new Fail(`the solver has no gas on chain ${chainId} yet, selling this coin opens once it's topped up`);
    const recipient = chainId === SOLANA ? this.d.runner.solanaAddress : this.d.runner.evmAddress;
    if (!recipient) throw new Fail("solana trading is off, the server has no SOLVER_SOLANA_KEY");
    log("solver.gas_topup", { chainId, balance: bal.toString() });
    const q = await this.d.relay.quote({
      user: this.d.runner.evmAddress,
      recipient,
      originChainId: BASE,
      originCurrency: BASE_USDC,
      destinationChainId: chainId,
      destinationCurrency: chainId === SOLANA ? "11111111111111111111111111111111" : "0x0000000000000000000000000000000000000000",
      amount: GAS_TOPUP_USDC,
      tradeType: "EXACT_INPUT",
    });
    await this.d.runner.run(q);
    for (let i = 0; i < 60; i++) {
      const now = await this.d.runner.nativeBalance(chainId);
      if (now !== null && now >= min) return;
      await Bun.sleep(1000);
    }
    throw new Fail(`gas top up on chain ${chainId} didn't arrive in time`);
  }

  async quote(chainId: number, token: string, isBuy: boolean, amountIn: bigint): Promise<{ amountOut: bigint; fee: bigint; impact: number }> {
    const row = { is_buy: isBuy ? 1 : 0, chain_id: chainId, token, amount_in: amountIn.toString() } as unknown as IntentRow;
    const q = await this.d.relay.quote(this.quoteParams(row));
    const out = BigInt(q.details.currencyOut.amount);
    const inUsd = Number(q.details.currencyIn.amountUsd ?? 0);
    const outUsd = Number(q.details.currencyOut.amountUsd ?? 0);
    const impact = inUsd > 0 && outUsd > 0 && outUsd < inUsd ? (inUsd - outUsd) / inUsd : 0;
    if (isBuy) return { amountOut: out, fee: 0n, impact };
    const { musd, fee } = this.sellNet(out);
    return { amountOut: musd, fee, impact };
  }

  private quoteParams(row: IntentRow): QuoteParams {
    const evm = this.d.runner.evmAddress;
    if (row.is_buy)
      return {
        user: evm,
        recipient: this.recipient(row),
        originChainId: BASE,
        originCurrency: BASE_USDC,
        destinationChainId: row.chain_id,
        destinationCurrency: row.token,
        amount: (BigInt(row.amount_in) / USDC_TO_MUSD).toString(),
        tradeType: "EXACT_INPUT",
      };
    const user = row.chain_id === SOLANA ? this.d.runner.solanaAddress : evm;
    if (!user) throw new Fail("solana trading is off, the server has no SOLVER_SOLANA_KEY");
    return {
      user,
      recipient: evm,
      originChainId: row.chain_id,
      originCurrency: row.token,
      destinationChainId: BASE,
      destinationCurrency: BASE_USDC,
      amount: row.amount_in,
      tradeType: "EXACT_INPUT",
    };
  }

  private sellNet(usdc: bigint): { musd: bigint; fee: bigint } {
    const gross = usdc * USDC_TO_MUSD;
    const fee = (gross * (this.fee ?? 50n)) / 10_000n;
    return { musd: gross - fee, fee };
  }

  private async drive(id: string) {
    let row = this.d.store.intent(id);
    if (!row || row.status === "settled" || row.status === "refunded") return;
    if (await this.d.ops.settled(row.id as Hash)) return;
    try {
      if (row.status === "open") await this.start1(row);
      row = this.d.store.intent(id)!;
      if (row.status === "filling") await this.waitFill(row);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      this.failed(row!, e.message);
    }
    row = this.d.store.intent(id)!;
    if (row.status === "filled" || row.status === "settling") await this.settle(row);
  }

  private failed(row: IntentRow, error: string) {
    log("solver.intent_failed", { id: row.id, error });
    this.d.store.update(row.id, { status: "filled", error, token_amount: "0", musd_out: row.is_buy ? row.amount_in : "0", fee: "0" });
  }

  private async start1(row: IntentRow) {
    if (!row.is_buy) {
      const free = this.d.store.held(row.user, row.chain_id, row.token) - this.d.store.reservedSells(row.user, row.chain_id, row.token, row.id);
      if (free < BigInt(row.amount_in)) throw new Fail("you hold less of this coin than you are selling");
      if (row.chain_id !== BASE) await this.ensureGas(row.chain_id);
    }
    let q: Quote;
    try {
      q = await this.d.relay.quote(this.quoteParams(row));
    } catch (e) {
      if (e instanceof Fail) throw e;
      throw new Fail(`no route: ${errMessage(e)}`);
    }
    const coin = row.is_buy ? q.details.currencyOut.currency : q.details.currencyIn.currency;
    this.d.store.seedCoin({ ...coin, address: row.token });
    const out = BigInt(q.details.currencyOut.amount);
    const minOut = BigInt(row.min_out);
    if (row.is_buy ? out < minOut : this.sellNet(out).musd < minOut) throw new Fail("the price moved past your minimum");
    const requestId = q.requestId ?? q.steps.find((s) => s.requestId)?.requestId;
    if (!requestId) throw new Fail("relay returned no request id");
    this.d.store.update(row.id, { status: "filling", request_id: requestId });
    try {
      const hashes = await this.d.runner.run(q);
      // a same chain evm swap is final once its receipt is in, so the amount comes from it without waiting on relay's status
      if (row.chain_id === BASE && hashes.length) {
        const got = await this.d.runner.received(BASE, hashes, row.is_buy ? row.token : BASE_USDC, this.recipient(row)).catch(() => null);
        if (got !== null) this.filled(row, got);
      }
    } catch (e) {
      log("solver.steps_error", { id: row.id, error: errMessage(e) });
      this.d.store.update(row.id, { error: errMessage(e) });
    }
  }

  private async waitFill(row: IntentRow) {
    const requestId = row.request_id!;
    const poll = this.d.pollMs ?? 1000;
    const start = Date.now();
    const sentFailed = row.error !== null;
    while (!this.stopped) {
      const st = await this.d.relay.status(requestId).catch(() => null);
      const s = st?.status ?? "unknown";
      if (s === "refund") throw new Fail(`relay refunded the swap${st?.failReason && st.failReason !== "N/A" ? `: ${st.failReason}` : ""}`);
      if (s === "success") break;
      const waited = Date.now() - start;
      if ((s === "waiting" || s === "unknown") && waited > (sentFailed ? (this.d.pollMs ?? 1000) * 5 : (this.d.waitingMs ?? 600_000)))
        throw new Fail(row.error ?? "relay never saw the deposit");
      if (waited > (this.d.fillMs ?? 1_800_000)) return;
      await Bun.sleep(poll);
    }
    if (this.stopped) return;
    const recipient = this.recipient(row);
    const currency = row.is_buy ? row.token : BASE_USDC;
    let got: bigint | null = null;
    for (let i = 0; i < 5 && got === null; i++) {
      const req = await this.d.relay.request(requestId).catch(() => null);
      got = req ? amountOut(req, recipient, currency) : null;
      if (got === null) await Bun.sleep(this.d.pollMs ?? 1000);
    }
    if (got === null) {
      const st = await this.d.relay.status(requestId).catch(() => null);
      const hashes = [...(st?.inTxHashes ?? []), ...(st?.txHashes ?? [])];
      got = await this.d.runner.received(row.is_buy ? row.chain_id : BASE, hashes, currency, recipient).catch(() => null);
    }
    if (got === null) {
      log("solver.amount_unknown", { id: row.id, requestId });
      return;
    }
    this.filled(row, got);
  }

  private filled(row: IntentRow, got: bigint) {
    if (row.is_buy) this.d.store.update(row.id, { status: "filled", token_amount: got.toString(), musd_out: "0", fee: "0", error: null });
    else {
      const { musd, fee } = this.sellNet(got);
      this.d.store.update(row.id, { status: "filled", token_amount: row.amount_in, musd_out: musd.toString(), fee: fee.toString(), error: null });
    }
  }

  private async settle(row: IntentRow) {
    // an intent started early whose open never landed can't settle onchain, after a grace period it's dropped so it stops reserving the position
    if (!(await this.d.ops.opened(row.id as Hash).catch(() => true))) {
      if (Date.now() / 1000 - row.opened_at < DROP_AFTER_S) return;
      this.d.store.update(row.id, { status: "refunded", error: row.error ?? "the trade never reached the vault" });
      log("solver.dropped", { id: row.id });
      this.pushTx(row.user, { id: row.id, kind: "intent", status: "failed", hash: null, error: row.error ?? "the trade never reached the vault" });
      return;
    }
    const ok = row.error === null;
    this.d.store.update(row.id, { status: "settling" });
    const out = await this.d.ops.settle(row.id as Hash, row.user as Address, BigInt(row.musd_out ?? "0"), BigInt(row.token_amount ?? "0"), ok);
    log("solver.settle_sent", { id: row.id, ok, hash: out.hash, mined: out.ok });
    if (!out.ok) this.d.store.update(row.id, { status: "filled" });
  }
}

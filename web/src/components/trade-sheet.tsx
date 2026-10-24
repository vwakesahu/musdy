"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowSquareOutIcon, ArrowsDownUpIcon } from "@phosphor-icons/react";
import { mezoTx, shortHash, txUrl } from "@/lib/explorer";
import { MorphButton } from "./ui/morph-button";
import type { FeedItem, TokenRef } from "shared";
import { isSolverOff, useActions, withSlippage } from "@/hooks/use-actions";
import { useDebounced } from "@/hooks/use-debounced";
import { useCash } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { useSession } from "@/hooks/use-session";
import { compact, parseDollars, pct, price, toNum, tokenAmount, usd } from "@/lib/format";
import { api } from "@/lib/http";
import { openSheet } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./ui/avatar";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";
import { applyKey, NumberPad } from "./ui/number-pad";
import { TokenIcon } from "./ui/token-icon";
import { keyOf } from "@/lib/xchain";
import { chain } from "@/lib/chain";
import { mezoTestnet, SOLANA } from "shared";

const chainLabel = (id: number) => (id === SOLANA ? "Solana" : id === 56 ? "BSC" : id === 8453 ? "Base" : "its own chain");

export type Side = "buy" | "sell";
export type TradeToken = TokenRef & { marketCapMusd?: string };
type Face = FeedItem["user"];

const BUY_CHIPS = [10, 50, 100, 250];
const SELL_CHIPS = [25n, 50n, 75n, 100n];
const E18 = 10n ** 18n;

export function Delta({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.round(value * 10_000) / 10_000 || 0;
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] leading-4 font-medium tabular-nums", tone, className)}>
      {v !== 0 && (
        <svg width="8" height="7" viewBox="0 0 7 6" aria-hidden className={v < 0 ? "rotate-180" : ""}>
          <path d="M3.5 0 7 6H0z" fill="currentColor" />
        </svg>
      )}
      {pct(Math.abs(v)).replace("+", "")}
    </span>
  );
}

export function Faces({ users, total }: { users: Face[]; total?: number }) {
  if (users.length === 0) return null;
  const extra = (total ?? users.length) - Math.min(3, users.length);
  return (
    <span className="flex items-center">
      {users.slice(0, 3).map((u, i) => (
        <span key={u.address} className={cn("rounded-full ring-2 ring-bg-sheet", i > 0 && "-ml-1.5")}>
          <UserAvatar user={u} size={16} />
        </span>
      ))}
      {extra > 0 && <span className="-ml-1.5 grid h-4 min-w-5 place-items-center rounded-full bg-surface-2 px-1 text-[9px] font-semibold text-text-2 ring-2 ring-bg-sheet">{extra}+</span>}
    </span>
  );
}

function fixed2(x: bigint) {
  return (Number(x / 10n ** 16n) / 100).toFixed(2);
}

type PanelProps = {
  token: TradeToken;
  priceMusd: bigint;
  change: number;
  held: bigint;
  side: Side;
  faces?: Face[];
  holders?: number;
  active: boolean;
  compactPad?: boolean;
  onDone: () => void;
};

const QUOTE_FRESH_MS = 4000;
const ESTIMATE_EXTRA_BPS = 300n;
const CLOSE_AFTER_TICK_MS = 700;

type Quoted = Awaited<ReturnType<typeof api.quote>> & { for: string; at: number };
const quoteKey = (token: TradeToken, isBuy: boolean, amount: bigint) => ["quote", keyOf(token), isBuy, amount.toString()];
const fetchQuote = async (token: TradeToken, isBuy: boolean, amount: bigint): Promise<Quoted> => ({ ...(await api.quote(token, isBuy, amount)), for: amount.toString(), at: Date.now() });

export function TradePanel({ token, priceMusd, change, held, side, faces = [], holders, active, compactPad = false, onDone }: PanelProps) {
  const [input, setInput] = useState("");
  const [inToken, setInToken] = useState(false);
  const [sellPct, setSellPct] = useState<bigint | null>(null);
  const { address } = useSession();
  const cash = useCash();
  const actions = useActions();
  const qc = useQueryClient();
  const { run, morph, accepted, tx } = useTxRun();
  const isBuy = side === "buy";
  const unit = 10n ** BigInt(token.decimals);

  const [submitted, setSent] = useState<{ amountIn: bigint; dollars: bigint; tokens: bigint } | null>(null);
  const sent = morph === "idle" ? null : submitted;
  const entered = parseDollars(input);
  const typedTokens = inToken ? (entered * unit) / E18 : priceMusd > 0n ? (entered * unit) / priceMusd : 0n;
  const typedDollars = inToken ? (typedTokens * priceMusd) / unit : entered;
  const sellTokens = sellPct !== null ? (held * sellPct) / 100n : typedTokens;
  const liveAmountIn = isBuy ? typedDollars : sellTokens > held ? held : sellTokens;
  const liveDollars = isBuy || (sellPct === null && !inToken) ? typedDollars : (liveAmountIn * priceMusd) / unit;
  const amountIn = sent?.amountIn ?? liveAmountIn;
  const shownDollars = sent?.dollars ?? liveDollars;

  const debounced = useDebounced(amountIn.toString(), 150);
  const quote = useQuery({
    queryKey: quoteKey(token, isBuy, BigInt(debounced)),
    queryFn: () => fetchQuote(token, isBuy, BigInt(debounced)),
    enabled: active && BigInt(debounced) > 0n,
    staleTime: 3000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!active) return;
    const first = isBuy ? BigInt(BUY_CHIPS[0]) * E18 : held;
    if (first > 0n) void qc.prefetchQuery({ queryKey: quoteKey(token, isBuy, first), queryFn: () => fetchQuote(token, isBuy, first), staleTime: 3000 });
  }, [active, isBuy, held, token, qc]);

  const last = quote.data && BigInt(quote.data.for) > 0n && amountIn > 0n ? quote.data : null;
  const exact = last && last.for === amountIn.toString() ? last : null;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const usable = exact ?? (last && now - last.at < QUOTE_FRESH_MS ? last : null);
  const outFor = (q: Quoted) => (q.for === amountIn.toString() ? BigInt(q.amountOut) : (BigInt(q.amountOut) * amountIn) / BigInt(q.for));
  const [solverOff, setSolverOff] = useState(false);
  const closed = solverOff || isSolverOff(quote.error);

  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!accepted) return;
    const t = setTimeout(() => done.current(), CLOSE_AFTER_TICK_MS);
    return () => clearTimeout(t);
  }, [accepted]);

  const short = isBuy && cash !== null && amountIn > cash;
  const sellTooMuch = !isBuy && sellTokens > held;
  const editable = sent === null;

  const press = (k: string) => {
    if (!editable) return;
    setSellPct(null);
    setInput((v) => applyKey(v, k, inToken ? 6 : 2));
  };

  useEffect(() => {
    if (!compactPad || !active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input,textarea,[contenteditable=true]")) return;
      if (/^[0-9.]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const submit = async () => {
    if (!usable) return;
    const out = outFor(usable);
    const tokensOut = isBuy ? out : liveAmountIn;
    const dollars = isBuy ? liveAmountIn : out;
    setSent({ amountIn: liveAmountIn, dollars: liveDollars, tokens: tokensOut });
    const order = { token, isBuy, amountIn: liveAmountIn, minOut: withSlippage(out, usable === exact ? 0n : ESTIMATE_EXTRA_BPS) };
    const label = `${usd(dollars, true)} of ${token.symbol}`;
    const meta = {
      kind: "trade" as const,
      title: `${isBuy ? "Buy" : "Sell"} ${label}`,
      done: `${isBuy ? "Bought" : "Sold"} ${label}`,
      pending: `${isBuy ? "Buying" : "Selling"} ${label}`,
      cashDelta: isBuy ? -liveAmountIn : out,
      pos: { token, delta: isBuy ? tokensOut : -liveAmountIn, musd: isBuy ? liveAmountIn : -liveDollars },
      feed: { token, isBuy, musdAmount: dollars.toString(), tokenAmount: tokensOut.toString(), priceMusd: priceMusd.toString(), ref: null },
    };
    const res = await run(() =>
      actions.trade(order, meta, (e) => {
        if (isSolverOff(e)) setSolverOff(true);
        return isSolverOff(e);
      }),
    );
    if (!res) setSent(null);
  };

  const flip = () => {
    if (!editable) return;
    setSellPct(null);
    if (inToken) setInput(typedDollars > 0n ? fixed2(typedDollars).replace(/\.00$/, "") : "");
    else setInput(typedTokens > 0n ? String(Number(toNum(typedTokens, token.decimals).toPrecision(6))) : "");
    setInToken((v) => !v);
  };

  const big = sent !== null || sellPct !== null ? `$${fixed2(shownDollars)}` : inToken ? input || "0" : `$${input || "0"}`;
  const sub = inToken
    ? `$${fixed2(typedDollars)}`
    : isBuy
      ? `${usable ? tokenAmount(outFor(usable), token.decimals) : tokenAmount(typedTokens, token.decimals)} ${token.symbol}`
      : `${tokenAmount(amountIn > 0n ? amountIn : held, token.decimals)} ${token.symbol}${amountIn > 0n ? "" : " held"}`;
  const empty = !input && sellPct === null;

  const demoFill = token.chainId !== chain.id && chain.id === mezoTestnet.id;
  let cta: React.ReactNode;
  if (!address) {
    cta = (
      <Button variant="white" size="lg" className="w-full" onClick={() => openSheet("login")}>
        Log in to trade
      </Button>
    );
  } else if (closed) {
    cta = (
      <p className="flex h-14 items-center justify-center rounded-lg bg-surface-2 text-[16px] font-medium text-text-2" role="status" data-testid="trade-closed">
        Trading this coin opens soon
      </p>
    );
  } else if (short) {
    cta = (
      <Button variant="white" size="lg" className="w-full" onClick={() => openSheet("deposit")}>
        Not enough cash, add cash
      </Button>
    );
  } else {
    cta = (
      <MorphButton
        state={morph}
        variant={isBuy ? "buy" : "sell"}
        className={cn("w-full", morph !== "success" && "text-white")}
        disabled={morph === "idle" && (amountIn === 0n || !usable || sellTooMuch)}
        onClick={submit}
        doneLabel={isBuy ? "Bought" : "Sold"}
        data-testid="trade-submit"
      >
        {`${isBuy ? "Buy" : "Sell"} ${token.symbol}`}
      </MorphButton>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <TokenIcon token={token} size={compactPad ? 44 : 40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] leading-[22px] font-medium">{token.symbol}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            {token.marketCapMusd && (
              <>
                <span className="rounded-[4px] border border-border-strong px-1 text-[10px] leading-[14px] font-medium">MC</span>
                <span className="tabular-nums">${compact(toNum(BigInt(token.marketCapMusd)))}</span>
              </>
            )}
            <Faces users={faces} total={holders} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[15px] leading-5 font-medium tabular-nums">{price(priceMusd)}</p>
          <Delta value={change} />
        </div>
      </div>

      <div className={cn("flex flex-col items-center", compactPad ? "pt-8 pb-5" : "pt-[clamp(8px,3dvh,40px)] pb-[clamp(4px,2dvh,24px)]")}>
        <span
          className={cn(
            "max-w-full truncate px-2 font-medium tracking-[-0.03em] tabular-nums",
            compactPad ? "text-[56px] leading-[60px]" : "text-[clamp(44px,8dvh,64px)] leading-[1.06]",
            empty && "text-faint",
            (short || sellTooMuch) && "text-down",
          )}
          data-testid="trade-amount"
        >
          {big}
          {inToken && sellPct === null && sent === null && <span className="ml-2 text-[24px] tracking-normal text-muted">{token.symbol}</span>}
        </span>
        <button
          type="button"
          onClick={flip}
          aria-label={inToken ? "Enter dollars" : `Enter ${token.symbol}`}
          className="press mt-1 inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[15px] text-muted tabular-nums hover:text-text-2"
        >
          {sub}
          <ArrowsDownUpIcon size={18} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {isBuy
          ? BUY_CHIPS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  if (!editable) return;
                  setInToken(false);
                  setInput(String(n));
                }}
                className="press h-9 cursor-pointer rounded-md border border-border bg-surface-2 text-[14px] font-semibold hover:bg-surface-3"
              >
                ${n}
              </button>
            ))
          : SELL_CHIPS.map((p) => (
              <button
                key={String(p)}
                disabled={held === 0n}
                onClick={() => {
                  if (!editable) return;
                  setSellPct(p);
                  setInput("");
                }}
                className={cn(
                  "press h-9 cursor-pointer rounded-md border text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                  sellPct === p ? "border-text bg-surface-3" : "border-border bg-surface-2 hover:bg-surface-3",
                )}
              >
                {String(p)}%
              </button>
            ))}
      </div>

      <div className="mt-2">
        <NumberPad size={compactPad ? "sm" : "fluid"} onKey={press} />
      </div>

      <p className="mt-2 flex min-h-5 items-center justify-between gap-3 text-[14px] leading-5 text-muted tabular-nums" data-testid="trade-quote">
        <span className="truncate">
          {isBuy ? (cash !== null ? `${usd(cash)} available` : "") : `${tokenAmount(held, token.decimals)} ${token.symbol} held`}
        </span>
        <span className="truncate text-right text-text">
          {closed ? (
            ""
          ) : quote.isError && !last ? (
            <span className="text-down">Quote unavailable</span>
          ) : last ? (
            <span className={cn("transition-opacity duration-150", !exact && "opacity-60")}>
              {`Fee ${usd(BigInt(last.fee), true)}${isBuy ? "" : ` · you get ${usd(outFor(last), true)}`}${last.priceImpact > 0.01 ? ` · ${(last.priceImpact * 100).toFixed(1)}% impact` : ""}`}
            </span>
          ) : amountIn > 0n ? (
            <span className="text-muted">Getting a quote</span>
          ) : (
            ""
          )}
        </span>
      </p>

      <div className="mt-3">{cta}</div>
      {accepted && sent ? (
        <Outcome text={`${isBuy ? "Bought" : "Sold"} ${usd(sent.dollars, true)} of ${token.symbol}`} hash={tx?.hash ?? null} />
      ) : demoFill && (
        <p className="mt-2 text-center text-[12px] leading-4 text-muted" data-testid="demo-note">
          Demo: your balance is Mezo testnet MUSD, the fill is real on {chainLabel(token.chainId)}
        </p>
      )}
    </div>
  );
}

function Outcome({ text, hash }: { text: string; hash: string | null }) {
  const reduced = useReducedMotion();
  const tx = mezoTx(hash);
  const url = tx ? txUrl(tx) : null;
  return (
    <motion.p
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.19, 1, 0.22, 1] }}
      className="mt-3 flex min-h-5 items-center justify-center gap-2 text-[14px] leading-5 font-medium"
      role="status"
      data-testid="trade-success"
    >
      <span className="text-up">{text}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          View tx <ArrowSquareOutIcon size={14} weight="bold" />
        </a>
      ) : (
        <span className="text-muted">{tx ? shortHash(tx.hash) : "filling"}</span>
      )}
    </motion.p>
  );
}

export function TradeSheet({
  open,
  onOpenChange,
  ...panel
}: Omit<PanelProps, "active" | "onDone" | "compactPad"> & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={`${panel.side === "buy" ? "Buy" : "Sell"} ${panel.token.symbol}`} hideTitle data-testid="trade-sheet" bodyClassName="pt-1 sm:pt-6">
      <TradePanel {...panel} active={open} onDone={() => onOpenChange(false)} />
    </Drawer>
  );
}

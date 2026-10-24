"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowsDownUpIcon, CheckIcon } from "@phosphor-icons/react";
import type { FeedItem, TokenRef } from "shared";
import { useActions, withSlippage } from "@/hooks/use-actions";
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

export function TradePanel({ token, priceMusd, change, held, side, faces = [], holders, active, compactPad = false, onDone }: PanelProps) {
  const [input, setInput] = useState("");
  const [inToken, setInToken] = useState(false);
  const [sellPct, setSellPct] = useState<bigint | null>(null);
  const { address } = useSession();
  const cash = useCash();
  const actions = useActions();
  const { run, sending, confirmed: success, failed } = useTxRun();
  const isBuy = side === "buy";
  const unit = 10n ** BigInt(token.decimals);

  const [submitted, setSent] = useState<{ amountIn: bigint; dollars: bigint; tokens: bigint; heldBefore: bigint } | null>(null);
  const sent = failed ? null : submitted;
  const entered = parseDollars(input);
  const typedTokens = inToken ? (entered * unit) / E18 : priceMusd > 0n ? (entered * unit) / priceMusd : 0n;
  const typedDollars = inToken ? (typedTokens * priceMusd) / unit : entered;
  const sellTokens = sellPct !== null ? (held * sellPct) / 100n : typedTokens;
  const liveAmountIn = isBuy ? typedDollars : sellTokens > held ? held : sellTokens;
  const liveDollars = isBuy || (sellPct === null && !inToken) ? typedDollars : (liveAmountIn * priceMusd) / unit;
  const amountIn = sent?.amountIn ?? liveAmountIn;
  const shownDollars = sent?.dollars ?? liveDollars;
  const positionIn = success && isBuy && sent !== null && held > sent.heldBefore;

  const debounced = useDebounced(amountIn.toString());
  const quote = useQuery({
    queryKey: ["quote", token.address, isBuy, debounced],
    queryFn: () => api.quote(token.address, isBuy, BigInt(debounced)),
    enabled: active && BigInt(debounced) > 0n,
    staleTime: 3000,
  });
  const q = quote.data && debounced === amountIn.toString() ? quote.data : null;

  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => done.current(), isBuy && !positionIn ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [success, isBuy, positionIn]);

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
    if (!q) return;
    const tokensOut = isBuy ? BigInt(q.amountOut) : liveAmountIn;
    const frozen = { amountIn: liveAmountIn, dollars: liveDollars, tokens: tokensOut, heldBefore: held };
    setSent(frozen);
    const res = await run(() => actions.trade({ token: token.address, isBuy, amountIn: frozen.amountIn, minOut: withSlippage(BigInt(q.amountOut)) }));
    if (!res) setSent(null);
  };

  const flip = () => {
    if (!editable) return;
    setSellPct(null);
    if (inToken) setInput(typedDollars > 0n ? fixed2(typedDollars).replace(/\.00$/, "") : "");
    else setInput(typedTokens > 0n ? String(Number(toNum(typedTokens, token.decimals).toPrecision(6))) : "");
    setInToken((v) => !v);
  };

  if (success && sent) {
    return (
      <div className="flex min-h-[420px] flex-col" role="status" data-testid="trade-success">
        <div className="flex flex-1 flex-col items-center justify-center pt-6 text-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.45 }}
            className="grid size-20 place-items-center rounded-full bg-up text-black"
          >
            <CheckIcon size={36} weight="bold" />
          </motion.span>
          <p className="mt-6 text-[24px] leading-[30px] font-medium">{isBuy ? `Bought ${token.symbol}` : `Sold ${token.symbol}`}</p>
          <p className="mt-1 text-[34px] leading-10 font-medium tracking-[-0.02em] tabular-nums" data-testid="trade-amount">
            ${fixed2(shownDollars)}
          </p>
          <p className="mt-2 text-[15px] text-muted tabular-nums">
            {tokenAmount(sent.tokens, token.decimals)} {token.symbol}
          </p>
          {isBuy &&
            (positionIn ? (
              <p className="mt-1 text-[15px] text-muted tabular-nums" data-testid="trade-position">
                You hold {tokenAmount(held, token.decimals)} {token.symbol}, {usd((held * priceMusd) / unit, true)}
              </p>
            ) : (
              <span className="skeleton mt-2 h-4 w-48" aria-hidden />
            ))}
        </div>
        <button onClick={onDone} className="press mt-8 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-up text-[17px] font-semibold text-black">
          Done
          <CheckIcon size={20} weight="bold" />
        </button>
      </div>
    );
  }

  const big = sent !== null || sellPct !== null ? `$${fixed2(shownDollars)}` : inToken ? input || "0" : `$${input || "0"}`;
  const sub = inToken
    ? `$${fixed2(typedDollars)}`
    : isBuy
      ? `${q ? tokenAmount(BigInt(q.amountOut), token.decimals) : tokenAmount(typedTokens, token.decimals)} ${token.symbol}`
      : `${tokenAmount(amountIn > 0n ? amountIn : held, token.decimals)} ${token.symbol}${amountIn > 0n ? "" : " held"}`;
  const empty = !input && sellPct === null;

  let cta: React.ReactNode;
  if (!address) {
    cta = (
      <Button variant="white" size="lg" className="w-full" onClick={() => openSheet("login")}>
        Log in to trade
      </Button>
    );
  } else if (short) {
    cta = (
      <Button variant="white" size="lg" className="w-full" onClick={() => openSheet("deposit")}>
        Not enough cash, add cash
      </Button>
    );
  } else {
    cta = (
      <Button
        variant={isBuy ? "buy" : "sell"}
        size="lg"
        className="w-full text-white"
        disabled={amountIn === 0n || !q || sellTooMuch}
        loading={sending}
        onClick={submit}
        data-testid="trade-submit"
      >
        {`${isBuy ? "Buy" : "Sell"} ${token.symbol}`}
      </Button>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <TokenIcon token={token} size={44} />
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

      <div className={cn("flex flex-col items-center", compactPad ? "pt-8 pb-5" : "pt-10 pb-7")}>
        <span
          className={cn("max-w-full truncate px-2 text-[64px] leading-[68px] font-medium tracking-[-0.03em] tabular-nums", empty && "text-faint", (short || sellTooMuch) && "text-down", compactPad && "text-[56px] leading-[60px]")}
          data-testid="trade-amount"
        >
          {big}
          {inToken && sellPct === null && sent === null && <span className="ml-2 text-[24px] tracking-normal text-muted">{token.symbol}</span>}
        </span>
        <button
          type="button"
          onClick={flip}
          aria-label={inToken ? "Enter dollars" : `Enter ${token.symbol}`}
          className="press mt-2 inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[15px] text-muted tabular-nums hover:text-text-2"
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
        <NumberPad size={compactPad ? "sm" : "lg"} onKey={press} />
      </div>

      <p className="mt-3 flex min-h-5 items-center justify-between gap-3 text-[14px] leading-5 text-muted tabular-nums" data-testid="trade-quote">
        <span className="truncate">
          {isBuy ? (cash !== null ? `${usd(cash)} available` : "") : `${tokenAmount(held, token.decimals)} ${token.symbol} held`}
        </span>
        <span className="truncate text-right text-text">
          {quote.isError
            ? <span className="text-down">Quote unavailable</span>
            : q
              ? `Fee ${usd(BigInt(q.fee), true)}${isBuy ? "" : ` · you get ${usd(BigInt(q.amountOut), true)}`}${q.priceImpact > 0.01 ? ` · ${(q.priceImpact * 100).toFixed(1)}% impact` : ""}`
              : amountIn > 0n
                ? <span className="text-muted">Getting a quote</span>
                : ""}
        </span>
      </p>

      <div className="mt-3">{cta}</div>
    </div>
  );
}

export function TradeSheet({
  open,
  onOpenChange,
  ...panel
}: Omit<PanelProps, "active" | "onDone" | "compactPad"> & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={`${panel.side === "buy" ? "Buy" : "Sell"} ${panel.token.symbol}`} hideTitle data-testid="trade-sheet" bodyClassName="pt-4 sm:pt-6">
      <TradePanel {...panel} active={open} onDone={() => onOpenChange(false)} />
    </Drawer>
  );
}

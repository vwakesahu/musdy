"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Drawer } from "vaul";
import type { TokenRef } from "shared";
import { useActions, withSlippage } from "@/hooks/use-actions";
import { useDebounced } from "@/hooks/use-debounced";
import { useCash } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { useDialogOpen } from "@/hooks/use-dialog-open";
import { Toaster } from "./toaster";
import { useSession } from "@/hooks/use-session";
import { parseDollars, tokenAmount, usd } from "@/lib/format";
import { api } from "@/lib/http";
import { openSheet } from "@/lib/ui";
import { Button } from "./ui/button";
import { applyKey, NumberPad } from "./ui/number-pad";
import { Segmented } from "./ui/segmented";

type Side = "buy" | "sell";
const BUY_CHIPS = [10, 50, 100, 250];
const SELL_CHIPS = [25n, 50n, 100n];

export function TradeSheet({
  token,
  priceMusd,
  held,
  side: initialSide,
  open,
  onOpenChange,
}: {
  token: TokenRef;
  priceMusd: bigint;
  held: bigint;
  side: Side;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [input, setInput] = useState("");
  const [sellPct, setSellPct] = useState<bigint | null>(null);
  const { address } = useSession();
  const cash = useCash();
  const actions = useActions();
  const { run, sending, confirmed: success, failed } = useTxRun();
  const isBuy = side === "buy";
  useDialogOpen(open);
  const unit = 10n ** BigInt(token.decimals);

  // what was sent, frozen at submit so the sheet doesn't drift as held and price move after the fill
  const [submitted, setSent] = useState<{ amountIn: bigint; dollars: bigint; heldBefore: bigint } | null>(null);
  const sent = failed ? null : submitted;
  const dollars = parseDollars(input);
  const sellTokens = sellPct !== null ? (held * sellPct) / 100n : priceMusd > 0n ? (dollars * unit) / priceMusd : 0n;
  const liveAmountIn = isBuy ? dollars : sellTokens > held ? held : sellTokens;
  const liveDollars = isBuy || sellPct === null ? dollars : (liveAmountIn * priceMusd) / unit;
  const amountIn = sent?.amountIn ?? liveAmountIn;
  const shownDollars = sent?.dollars ?? liveDollars;
  const positionIn = success && isBuy && sent !== null && held > sent.heldBefore;

  const debounced = useDebounced(amountIn.toString());
  const quote = useQuery({
    queryKey: ["quote", token.address, isBuy, debounced],
    queryFn: () => api.quote(token.address, isBuy, BigInt(debounced)),
    enabled: open && BigInt(debounced) > 0n,
    staleTime: 3000,
  });
  const q = quote.data && debounced === amountIn.toString() ? quote.data : null;

  // a buy waits for the new position to show, never more than a few seconds
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => onOpenChange(false), isBuy && !positionIn ? 4000 : 1200);
    return () => clearTimeout(t);
  }, [success, isBuy, positionIn, onOpenChange]);

  const short = isBuy && cash !== null && amountIn > cash;
  const sellTooMuch = !isBuy && sellTokens > held;

  const submit = async () => {
    if (!q) return;
    const frozen = { amountIn: liveAmountIn, dollars: liveDollars, heldBefore: held };
    setSent(frozen);
    const res = await run(() => actions.trade({ token: token.address, isBuy, amountIn: frozen.amountIn, minOut: withSlippage(BigInt(q.amountOut)) }));
    if (!res) setSent(null);
  };
  const editable = sent === null;


  let cta: React.ReactNode;
  if (!address) {
    cta = (
      <Button variant="accent" className="h-[52px] w-full" onClick={() => openSheet("login")}>
        Log in to trade
      </Button>
    );
  } else if (short) {
    cta = (
      <Button variant="raised" className="h-[52px] w-full" onClick={() => openSheet("deposit")}>
        Not enough cash. Add cash
      </Button>
    );
  } else {
    cta = (
      <Button
        variant={isBuy ? "accent" : "sell"}
        className="h-[52px] w-full"
        disabled={amountIn === 0n || !q || sending || sellTooMuch}
        onClick={submit}
        data-testid="trade-submit"
      >
        {sending ? "Sending" : `${isBuy ? "Buy" : "Sell"} ${token.symbol}`}
      </Button>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[480px] flex-col rounded-t-[24px] border-t border-line bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] outline-none"
          data-testid="trade-sheet"
        >
          {open && <Toaster inSheet />}
          <div className="mx-auto mt-3 mb-3 h-1 w-9 rounded-full bg-line" aria-hidden />
          <Drawer.Title className="sr-only">
            {isBuy ? "Buy" : "Sell"} {token.symbol}
          </Drawer.Title>
          <Segmented
            value={side}
            onChange={(s) => {
              if (!editable) return;
              setSide(s);
              setInput("");
              setSellPct(null);
            }}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
          />
          <div className="mt-4 flex items-baseline justify-between gap-3 rounded-[14px] bg-raised px-4 py-3">
            <span className={`text-[40px] leading-[44px] font-bold tracking-[-0.03em] tabular-nums ${input || sellPct ? "" : "text-muted"}`} data-testid="trade-amount">
              ${sent !== null || sellPct !== null ? (Number(shownDollars / 10n ** 16n) / 100).toFixed(2) : input || "0"}
            </span>
            <span className="truncate text-right text-[14px] text-muted">
              {isBuy
                ? q
                  ? `${tokenAmount(BigInt(q.amountOut), token.decimals)} ${token.symbol}`
                  : ""
                : amountIn > 0n
                  ? `${tokenAmount(amountIn, token.decimals)} ${token.symbol}`
                  : `${tokenAmount(held, token.decimals)} held`}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            {isBuy
              ? [...BUY_CHIPS.map((n) => ({ label: `$${n}`, act: () => editable && setInput(String(n)) })), ...(cash !== null && cash > 0n ? [{ label: "max", act: () => editable && setInput((Number(cash / 10n ** 16n) / 100).toFixed(2)) }] : [])].map((c) => (
                  <button key={c.label} onClick={c.act} className="press h-11 flex-1 rounded-full bg-raised text-[14px] font-medium">
                    {c.label}
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
                    className={`press h-11 flex-1 rounded-full text-[14px] font-medium disabled:opacity-40 ${sellPct === p ? "bg-accent-tint text-accent" : "bg-raised"}`}
                  >
                    {String(p)}%
                  </button>
                ))}
          </div>
          <p className="mt-3 min-h-5 text-[13px] leading-5 text-muted" data-testid="trade-quote">
            {quote.isError
              ? `Quote unavailable: ${quote.error.message}`
              : q
                ? `Fee ${usd(BigInt(q.fee), true)} · impact ${(q.priceImpact * 100).toFixed(2)}% · ${isBuy ? "min" : "you get"} ${isBuy ? `${tokenAmount(withSlippage(BigInt(q.amountOut)), token.decimals)} ${token.symbol}` : usd(BigInt(q.amountOut), true)}`
                : amountIn > 0n
                  ? "Getting a quote"
                  : isBuy && cash !== null
                    ? `Cash ${usd(cash, true)}`
                    : " "}
          </p>
          <div className="mt-3">
            {success ? (
              <div className="flex h-[52px] items-center justify-center gap-2 text-[15px] font-semibold" role="status" data-testid="trade-success">
                <svg width="22" height="22" viewBox="0 0 24 24" className="draw-check text-up" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="flex flex-col">
                  <span>{isBuy ? `Bought ${token.symbol}` : `Sold ${token.symbol}`}</span>
                  {isBuy &&
                    (positionIn ? (
                      <span className="text-[13px] leading-5 font-medium text-muted tabular-nums" data-testid="trade-position">
                        You hold {tokenAmount(held, token.decimals)} {token.symbol}, {usd((held * priceMusd) / unit, true)}
                      </span>
                    ) : (
                      <span className="mt-1 h-3.5 w-40 rounded bg-raised" aria-hidden />
                    ))}
                </span>
              </div>
            ) : (
              cta
            )}
          </div>
          <div className="mt-3">
            <NumberPad
              onKey={(k) => {
                if (!editable) return;
                setSellPct(null);
                setInput((v) => applyKey(v, k));
              }}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

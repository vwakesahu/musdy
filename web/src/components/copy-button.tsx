"use client";
import type { FeedItem } from "shared";
import { useActions } from "@/hooks/use-actions";
import { useCash } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { Icon } from "./ui/icon";

export function CopyButton({ item }: { item: FeedItem }) {
  const actions = useActions();
  const cash = useCash();
  const { run, sending: busy, confirmed: done } = useTxRun();
  const copy = () => run(() => actions.copy(item, cash ?? 0n));

  return (
    <button
      onClick={copy}
      disabled={busy || done}
      aria-label={`Copy ${item.user.handle ?? "this trade"}: buy ${item.token.symbol}`}
      data-testid="copy-trade"
      className="press relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/60 text-accent disabled:opacity-60"
    >
      {done ? (
        <svg width="18" height="18" viewBox="0 0 24 24" className="draw-check" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      ) : (
        <Icon name="copy" size={18} />
      )}
    </button>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { FeedItem } from "shared";
import { useActions } from "@/hooks/use-actions";
import { useCash } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { useTxRun } from "@/hooks/use-tx-run";
import { useStore } from "@/lib/store";
import { openSheet, sheet } from "@/lib/ui";
import { RepeatIcon } from "@phosphor-icons/react";

export function CopyButton({ item }: { item: FeedItem }) {
  const actions = useActions();
  const cash = useCash();
  const { signer } = useSession();
  const loginOpen = useStore(sheet, (s) => s === "login", false);
  const [afterLogin, setAfterLogin] = useState(false);
  const { run, sending: busy, confirmed: done } = useTxRun();

  const copy = () => {
    if (!signer) {
      setAfterLogin(true);
      openSheet("login");
      return;
    }
    void run(() => actions.copy(item, cash ?? 0n));
  };

  if (afterLogin && !signer && !loginOpen) setAfterLogin(false);
  useEffect(() => {
    if (!afterLogin || !signer || cash === null) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      setAfterLogin(false);
      void run(() => actions.copy(item, cash));
    });
    return () => {
      live = false;
    };
  }, [afterLogin, signer, cash, actions, item, run]);

  const waiting = busy || (afterLogin && !!signer);
  return (
    <button
      onClick={copy}
      disabled={waiting || done}
      aria-label={`Copy ${item.user.handle ?? "this trade"}: buy ${item.token.symbol}`}
      data-testid="copy-trade"
      className="press group relative z-10 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-[14px] leading-[18px] font-semibold text-text transition-colors group-hover/row:bg-accent group-hover/row:text-white hover:bg-accent hover:text-white disabled:cursor-default disabled:opacity-60"
    >
      {done ? (
        <svg width="16" height="16" viewBox="0 0 24 24" className="draw-check" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : waiting ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      ) : (
        <RepeatIcon size={16} weight="bold" />
      )}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

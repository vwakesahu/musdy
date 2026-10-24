"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { ArrowSquareOutIcon, CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { activity, type Activity } from "@/lib/activity";
import { mezoTx, shortHash, txUrl } from "@/lib/explorer";
import { timeAgo, usd } from "@/lib/format";
import { api } from "@/lib/http";
import { useNow } from "@/hooks/use-now";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EmptyState } from "./ui/empty-state";
import { Spinner } from "./ui/spinner";

const none: Activity[] = [];
const SHOW = 8;

export function ActivityList({ address }: { address: Address }) {
  const owner = address.toLowerCase();
  const local = useStore(activity, (a) => a, none);
  const trades = useQuery({ queryKey: ["userTrades", owner], queryFn: () => api.userTrades(address) }).data;
  const [all, setAll] = useState(false);
  const now = useNow();

  const rows = useMemo(() => {
    const mine = local.filter((a) => a.owner === owner);
    const hashes = new Set(mine.map((a) => a.tx?.hash.toLowerCase()).filter(Boolean));
    const fromServer: Activity[] = (trades ?? [])
      .filter((t) => !hashes.has(t.txHash.toLowerCase()))
      .map((t) => ({
        id: t.id,
        owner,
        kind: "trade",
        title: `${t.isBuy ? "Buy" : "Sell"} ${usd(BigInt(t.musdAmount), true)} of ${t.token.symbol}`,
        status: "confirmed",
        at: t.ts * 1000,
        tx: mezoTx(t.txHash),
      }));
    return [...mine, ...fromServer].sort((a, b) => b.at - a.at);
  }, [local, trades, owner]);

  const shown = all ? rows : rows.slice(0, SHOW);
  return (
    <section aria-labelledby="activity-title" data-testid="activity">
      <h2 id="activity-title" className="px-4 pt-8 pb-2 text-[17px] leading-[22px] font-medium tracking-[-0.01em] lg:px-6">
        Activity
      </h2>
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" body="Buys, sells, deposits and withdrawals show up here with their transaction." />
      ) : (
        <ul>
          {shown.map((a) => (
            <ActivityRow key={a.id} a={a} now={now} />
          ))}
        </ul>
      )}
      {rows.length > SHOW && (
        <button onClick={() => setAll((v) => !v)} className="press mx-4 mt-2 h-9 cursor-pointer rounded-[10px] px-3 text-[14px] font-semibold text-accent hover:bg-surface-3 lg:mx-6">
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

const statusText = { pending: "Pending", confirmed: "Done", failed: "Failed" } as const;

function ActivityRow({ a, now }: { a: Activity; now: number }) {
  const url = a.tx ? txUrl(a.tx) : null;
  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3 lg:px-6" data-testid="activity-row" data-status={a.status}>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          a.status === "pending" ? "bg-surface-2 text-accent-hi" : a.status === "confirmed" ? "bg-up-soft text-up" : "bg-down-soft text-down",
        )}
      >
        {a.status === "pending" ? <Spinner className="size-4.5" /> : a.status === "confirmed" ? <CheckIcon size={18} weight="bold" /> : <WarningIcon size={18} weight="fill" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-medium">{a.title}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[17px] text-muted">
          <span className={cn(a.status === "failed" && "text-down", a.status === "pending" && "text-text-2")}>{statusText[a.status]}</span>
          {now > 0 && ` · ${timeAgo(Math.floor(a.at / 1000), now)}`}
          {a.status === "failed" && a.error ? ` · ${a.error}` : ""}
        </span>
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] px-2 text-[14px] font-semibold text-accent hover:bg-surface-3">
          View tx <ArrowSquareOutIcon size={14} weight="bold" />
        </a>
      ) : a.tx ? (
        <span className="shrink-0 font-mono text-[12px] text-muted">{shortHash(a.tx.hash)}</span>
      ) : null}
    </li>
  );
}

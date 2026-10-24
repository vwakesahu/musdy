"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TokenSort, type TokenInfo } from "shared";
import { RowSkeletons } from "../feed-list";
import { UnderlineTabs } from "../underline-tabs";
import { ScreenHeader } from "../screen-header";
import { TokenRow } from "../token-row";
import { EmptyState } from "../ui/empty-state";
import { CaretRightIcon, MagnifyingGlassIcon, RocketIcon, XIcon } from "@phosphor-icons/react";
import { RightRail } from "../right-rail";
import { api } from "@/lib/http";
import { liveTokens } from "@/lib/live";
import { useStore } from "@/lib/store";
import { keyOf } from "@/lib/xchain";

const empties: Record<TokenSort, { title: string; body: string }> = {
  trending: { title: "Nothing is trending yet", body: "Coins with the most buying in the last day show up here." },
  new: { title: "No launches yet", body: "Launch the first coin with the button above. It shows up here with its curve progress." },
  stocks: { title: "No stocks or BTC listed yet", body: "Tokens with a MUSD pool on Mezo show up here." },
};

const none: Record<string, TokenInfo> = {};

function withLive(list: TokenInfo[], live: Record<string, TokenInfo>, sort: TokenSort) {
  const merged = list.map((t) => live[keyOf(t)] ?? t);
  if (sort === "new") {
    const known = new Set(merged.map((t) => keyOf(t)));
    const fresh = Object.values(live).filter((t) => t.kind === "launch" && !known.has(keyOf(t)));
    return [...fresh, ...merged].sort((a, b) => b.createdAt - a.createdAt);
  }
  return merged;
}

export function ExploreScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const parsed = TokenSort.safeParse(params.get("sort"));
  const sort: TokenSort = parsed.success ? parsed.data : "trending";
  const setSort = (s: TokenSort) => router.replace(s === "trending" ? path : `${path}?sort=${s}`, { scroll: false });
  const [q, setQ] = useState("");
  const live = useStore(liveTokens, (t) => t, none);
  const trending = useQuery({ queryKey: ["tokens", "trending"], queryFn: () => api.tokens("trending") });
  const fresh = useQuery({ queryKey: ["tokens", "new"], queryFn: () => api.tokens("new") });
  const stocks = useQuery({ queryKey: ["tokens", "stocks"], queryFn: () => api.tokens("stocks") });
  const bySort = { trending, new: fresh, stocks };
  const current = bySort[sort];

  const needle = q.trim().toLowerCase();
  let list: TokenInfo[];
  if (needle) {
    const all = new Map<string, TokenInfo>();
    for (const t of [...(trending.data ?? []), ...(fresh.data ?? []), ...(stocks.data ?? []), ...Object.values(live)]) all.set(keyOf(t), live[keyOf(t)] ?? t);
    list = [...all.values()].filter(
      (t) => t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle) || t.address.toLowerCase() === needle,
    );
  } else {
    list = withLive(current.data ?? [], live, sort);
  }

  const loading = !needle && current.isPending;
  const failed = !needle && current.isError && list.length === 0;

  const everything = new Map<string, TokenInfo>();
  for (const t of [...(trending.data ?? []), ...(stocks.data ?? []), ...(fresh.data ?? [])]) everything.set(keyOf(t), live[keyOf(t)] ?? t);
  const movers = [...everything.values()].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
  const launches = withLive(fresh.data ?? [], live, "new").slice(0, 5);

  return (
    <>
      <ScreenHeader title="Explore" />
      <div className="px-4 pb-1 lg:px-6">
        <label className="flex h-11 items-center gap-2 rounded-[12px] border border-border bg-surface px-3 text-muted transition-colors focus-within:border-accent-hi">
          <MagnifyingGlassIcon size={18} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coins, stocks, addresses"
            aria-label="Search"
            className="h-full flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-faint"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="grid size-7 place-items-center rounded-full bg-surface-3 text-text-2">
              <XIcon size={14} weight="bold" />
            </button>
          )}
        </label>
      </div>
      {!needle && (
        <div className="px-4 pt-3 lg:px-6">
          <Link
            href="/launch"
            className="press flex min-h-[68px] items-center gap-3 rounded-[14px] border border-border bg-surface px-3 py-3 transition-colors hover:bg-surface-3"
            data-testid="explore-launch"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white shadow-glow">
              <RocketIcon size={22} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] leading-5 font-medium">Launch a coin</span>
              <span className="mt-0.5 block truncate text-[13px] leading-[17px] text-muted">Name it, pick a ticker, make the first buy</span>
            </span>
            <CaretRightIcon size={16} weight="bold" className="text-muted" />
          </Link>
        </div>
      )}
      {!needle && (
        <UnderlineTabs
          label="Sort"
          className="mt-2"
          value={sort}
          onChange={setSort}
          options={[
            { value: "trending", label: "Trending" },
            { value: "new", label: "New" },
            { value: "stocks", label: "Stocks" },
          ]}
        />
      )}
      <div className="pt-2">
        {loading ? (
          <RowSkeletons />
        ) : failed ? (
          <EmptyState title="Can't reach the musdy server" body="Prices and coins load once it's back." />
        ) : list.length === 0 ? (
          needle ? <EmptyState title={`Nothing matches "${q.trim()}"`} body="Try a ticker like BTC or NVDA, or paste a token address." /> : <EmptyState {...empties[sort]} />
        ) : (
          <ul>
            {list.map((t) => (
              <li key={keyOf(t)}>
                <TokenRow token={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <RightRail>
        <RailList title="Top movers" tokens={movers} />
        <RailList title="Just launched" tokens={launches} />
      </RightRail>
    </>
  );
}

function RailList({ title, tokens }: { title: string; tokens: TokenInfo[] }) {
  if (tokens.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-2 text-[17px] leading-[22px] font-medium tracking-[-0.01em]">{title}</h2>
      <ul>
        {tokens.map((t) => (
          <li key={keyOf(t)}>
            <TokenRow token={t} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

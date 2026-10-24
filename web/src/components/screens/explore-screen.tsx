"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TokenInfo } from "shared";
import { RowSkeletons } from "../feed-list";
import { ScreenHeader } from "../screen-header";
import { TokenRow } from "../token-row";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Segmented } from "../ui/segmented";
import { api, type TokenSort } from "@/lib/http";
import { liveTokens, lk } from "@/lib/live";
import { useStore } from "@/lib/store";

const empties: Record<TokenSort, { title: string; body: string }> = {
  trending: { title: "Nothing is trending yet", body: "Coins with the most buying in the last day show up here." },
  new: { title: "No launches yet", body: "Launch the first coin from the + tab. It shows up here with its curve progress." },
  stocks: { title: "No stocks or BTC listed yet", body: "Tokens with a MUSD pool on Mezo show up here." },
};

const none: Record<string, TokenInfo> = {};

function withLive(list: TokenInfo[], live: Record<string, TokenInfo>, sort: TokenSort) {
  const merged = list.map((t) => live[lk(t.address)] ?? t);
  if (sort === "new") {
    const known = new Set(merged.map((t) => lk(t.address)));
    const fresh = Object.values(live).filter((t) => t.kind === "launch" && !known.has(lk(t.address)));
    return [...fresh, ...merged].sort((a, b) => b.createdAt - a.createdAt);
  }
  return merged;
}

export function ExploreScreen() {
  const [sort, setSort] = useState<TokenSort>("trending");
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
    for (const t of [...(trending.data ?? []), ...(fresh.data ?? []), ...(stocks.data ?? []), ...Object.values(live)]) all.set(lk(t.address), live[lk(t.address)] ?? t);
    list = [...all.values()].filter(
      (t) => t.symbol.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle) || t.address.toLowerCase() === needle,
    );
  } else {
    list = withLive(current.data ?? [], live, sort);
  }

  const loading = !needle && current.isPending;
  const failed = !needle && current.isError && list.length === 0;

  return (
    <>
      <ScreenHeader title="Explore" />
      <div className="flex flex-col gap-3 px-4 pb-2">
        <label className="flex h-11 items-center gap-2 rounded-[14px] bg-surface px-3 text-muted">
          <Icon name="explore" size={20} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coins, stocks, addresses"
            aria-label="Search"
            className="h-full flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
          />
        </label>
        {!needle && (
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: "trending", label: "Trending" },
              { value: "new", label: "New" },
              { value: "stocks", label: "Stocks" },
            ]}
          />
        )}
      </div>
      {loading ? (
        <RowSkeletons />
      ) : failed ? (
        <EmptyState title="Can't reach the musdy server" body="Prices and coins load once it's back." />
      ) : list.length === 0 ? (
        needle ? <EmptyState title={`Nothing matches "${q.trim()}"`} /> : <EmptyState {...empties[sort]} />
      ) : (
        <ul>
          {list.map((t) => (
            <li key={t.address}>
              <TokenRow token={t} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

"use client";
import { useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeedItem } from "shared";
import { useTopic } from "./use-topic";

const MAX = 200;

const newestFirst = (a: FeedItem, b: FeedItem) => b.block - a.block || b.ts - a.ts || (a.id < b.id ? 1 : -1);

export function mergeItems(prev: FeedItem[], add: FeedItem[]) {
  if (add.length === 0) return prev;
  const seen = new Set(prev.map((x) => x.id));
  const fresh = add.filter((x) => !seen.has(x.id));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort(newestFirst).slice(0, MAX);
}

type State = { key: string; items: FeedItem[]; live: Set<string> };
type Action = { key: string; add: FeedItem[]; live?: boolean };

// only trades that arrive live animate in, a page load or a replay just appears
const reducer = (s: State, a: Action): State => {
  const base = a.key !== s.key ? { key: a.key, items: [], live: new Set<string>() } : s;
  const items = mergeItems(base.items, a.add);
  if (items === base.items) return base;
  const live = a.live ? new Set([...base.live, ...a.add.map((x) => x.id)]) : base.live;
  return { key: a.key, items, live };
};

// a list of trades from one http page plus the live socket topic, deduped by id
export function useTradeList(topic: string | null, queryKey: unknown[], fetcher: (() => Promise<FeedItem[]>) | null) {
  const key = topic ?? "none";
  const [state, dispatch] = useReducer(reducer, { key, items: [], live: new Set<string>() });
  const q = useQuery({ queryKey, queryFn: () => (fetcher ? fetcher() : Promise.resolve([])), enabled: !!fetcher });

  useEffect(() => {
    if (q.data) dispatch({ key, add: q.data });
  }, [q.data, key]);

  useTopic(topic, (m) => {
    if (m.type === "trade") dispatch({ key, add: [m.item], live: !m.replay });
  });

  const items = state.key === key ? state.items : [];
  const live = state.key === key ? state.live : null;
  return { items, live, loading: q.isPending && !!fetcher && items.length === 0, error: q.error };
}

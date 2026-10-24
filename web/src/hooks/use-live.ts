"use client";
import type { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { api, type ChainToken } from "@/lib/http";
import { liveBalances, livePrices, liveTokens, liveTxs, lk, type LivePrice } from "@/lib/live";
import { useStore } from "@/lib/store";
import { keyOf } from "@/lib/xchain";
import { cashWith, ops, positionsWith, type Op, type ShownPosition } from "@/lib/optimistic";
import { useDeployment } from "./use-deployment";
import { useSession } from "./use-session";

export const useLivePrice = (t: ChainToken | undefined): LivePrice | null =>
  useStore(livePrices, (p) => (t ? (p[keyOf(t)] ?? null) : null), null);

export function useCurrentPrice(t: ChainToken): bigint | null {
  const live = useLivePrice(t);
  const one = useQuery({
    queryKey: ["token", keyOf(t)],
    queryFn: () => api.token(t),
    enabled: !live,
    staleTime: 60_000,
  });
  if (live) return live.priceMusd;
  return one.data ? BigInt(one.data.priceMusd) : null;
}

export const useLiveToken = (ref: ChainToken | undefined) =>
  useStore(liveTokens, (t) => (ref ? (t[keyOf(ref)] ?? null) : null), null);

export const useTx = (id: string | null) => useStore(liveTxs, (t) => (id ? (t[id] ?? null) : null), null);

export function useProfile(address: Address | null | undefined) {
  const viewer = useSession().address ?? undefined;
  return useQuery({
    queryKey: ["user", address?.toLowerCase(), viewer?.toLowerCase() ?? null],
    queryFn: () => api.user(address as Address, viewer),
    enabled: !!address,
  });
}

const noOps: Op[] = [];
export const useOps = () => useStore(ops, (o) => o, noOps);

export function useCash(): bigint | null {
  const server = useServerCash();
  const { address } = useSession();
  const list = useOps();
  return server === null ? null : cashWith(list, address, server);
}

export function usePositions(address: Address | null | undefined): ShownPosition[] | null {
  const profile = useProfile(address);
  const list = useOps();
  if (!profile.data) return null;
  return positionsWith(list, address, profile.data.positions);
}

export function useServerCash(): bigint | null {
  const { address } = useSession();
  const dep = useDeployment();
  const profile = useProfile(address);
  const musd = dep.data?.musd;
  const live = useStore(liveBalances, (b) => (b && musd ? (b.vault[lk(musd)] ?? 0n) : null), null);
  if (!address) return null;
  if (live !== null) return live;
  return profile.data ? BigInt(profile.data.balanceMusd) : null;
}

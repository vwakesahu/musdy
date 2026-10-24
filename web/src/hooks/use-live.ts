"use client";
import type { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { liveBalances, livePrices, liveTokens, liveTxs, lk, type LivePrice } from "@/lib/live";
import { useStore } from "@/lib/store";
import { useDeployment } from "./use-deployment";
import { useSession } from "./use-session";

export const useLivePrice = (address: string | undefined): LivePrice | null =>
  useStore(livePrices, (p) => (address ? (p[lk(address)] ?? null) : null), null);

export function useCurrentPrice(address: string): bigint | null {
  const live = useLivePrice(address);
  const one = useQuery({
    queryKey: ["token", lk(address)],
    queryFn: () => api.token(address as Address),
    enabled: !live,
    staleTime: 60_000,
  });
  if (live) return live.priceMusd;
  return one.data ? BigInt(one.data.priceMusd) : null;
}

export const useLiveToken = (address: string | undefined) =>
  useStore(liveTokens, (t) => (address ? (t[lk(address)] ?? null) : null), null);

export const useTx = (id: string | null) => useStore(liveTxs, (t) => (id ? (t[id] ?? null) : null), null);

export function useProfile(address: Address | null | undefined) {
  const viewer = useSession().address ?? undefined;
  return useQuery({
    queryKey: ["user", address?.toLowerCase(), viewer?.toLowerCase() ?? null],
    queryFn: () => api.user(address as Address, viewer),
    enabled: !!address,
  });
}

export function useCash(): bigint | null {
  const { address } = useSession();
  const dep = useDeployment();
  const profile = useProfile(address);
  const musd = dep.data?.musd;
  const live = useStore(liveBalances, (b) => (b && musd ? (b.vault[lk(musd)] ?? 0n) : null), null);
  if (!address) return null;
  if (live !== null) return live;
  return profile.data ? BigInt(profile.data.balanceMusd) : null;
}

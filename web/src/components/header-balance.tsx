"use client";
import { useIsRailWide } from "@/hooks/use-media-query";
import { BalancePill } from "./balance-pill";

export function HeaderBalance({ login = true }: { login?: boolean }) {
  return useIsRailWide() ? null : <BalancePill login={login} />;
}

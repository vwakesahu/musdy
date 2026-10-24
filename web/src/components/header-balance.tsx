"use client";
import { useIsRailWide } from "@/hooks/use-media-query";
import { BalancePill } from "./balance-pill";

export function HeaderBalance() {
  return useIsRailWide() ? null : <BalancePill />;
}

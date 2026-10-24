"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsDesktop } from "@/hooks/use-media-query";

export const RightRailSlot = createContext<HTMLElement | null>(null);

export function RightRail({ children }: { children: ReactNode }) {
  const slot = useContext(RightRailSlot);
  const desktop = useIsDesktop();
  if (!slot || !desktop) return null;
  return createPortal(children, slot);
}

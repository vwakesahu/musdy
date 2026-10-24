"use client";
import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsWide = () => useMediaQuery("(min-width: 640px)");
export const useIsRailWide = () => useMediaQuery("(min-width: 1280px)");

"use client";
import { useSyncExternalStore } from "react";

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const x of listeners) x();
    }, 10_000);
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// wall clock that ticks every 10s, 0 on the server
export const useNow = () =>
  useSyncExternalStore(
    subscribe,
    () => now || Date.now(),
    () => 0,
  );

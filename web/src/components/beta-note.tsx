"use client";
import { useSyncExternalStore } from "react";
import { XIcon } from "@phosphor-icons/react";

const KEY = "musdy:beta-note";
const listeners = new Set<() => void>();

const read = () => {
  try {
    return localStorage.getItem(KEY) !== "hidden";
  } catch {
    return true;
  }
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const hide = () => {
  try {
    localStorage.setItem(KEY, "hidden");
  } catch {
    return;
  } finally {
    listeners.forEach((fn) => fn());
  }
};

export function BetaNote() {
  const show = useSyncExternalStore(subscribe, read, () => false);
  if (!show) return null;
  return (
    <div role="note" className="relative flex h-7 items-center justify-center border-b border-border px-10 text-[12px] text-faint">
      <span className="truncate">Beta. Keep deposits to $10–20.</span>
      <button type="button" onClick={hide} aria-label="Dismiss beta note" className="absolute right-1 grid size-7 place-items-center text-faint hover:text-muted">
        <XIcon size={12} weight="bold" />
      </button>
    </div>
  );
}

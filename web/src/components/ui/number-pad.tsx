"use client";
import { BackspaceIcon } from "@phosphor-icons/react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

export function applyKey(value: string, key: string, maxDecimals = 2) {
  if (key === "del") return value.slice(0, -1);
  if (key === ".") return value.includes(".") || maxDecimals === 0 ? value : (value || "0") + ".";
  const [, frac] = value.split(".");
  if (frac !== undefined && frac.length >= maxDecimals) return value;
  if (value === "0") return key;
  if (value.replace(".", "").length >= 12) return value;
  return value + key;
}

export function NumberPad({ onKey, size = "md" }: { onKey: (key: string) => void; size?: "md" | "lg" | "sm" }) {
  const key = size === "lg" ? "h-16 text-[28px]" : size === "sm" ? "h-11 text-[20px]" : "h-12 text-[22px]";
  return (
    <div className="grid grid-cols-3 gap-1 select-none">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "del" ? "Delete" : k}
          onClick={() => onKey(k)}
          className={`group relative grid cursor-pointer place-items-center font-normal tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-accent-hi ${key}`}
        >
          <span aria-hidden className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 scale-75 rounded-full bg-surface-3 opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-50 group-active:scale-100 group-active:opacity-100 group-active:duration-75" />
          <span className="relative">{k === "del" ? <BackspaceIcon size={26} /> : k}</span>
        </button>
      ))}
    </div>
  );
}

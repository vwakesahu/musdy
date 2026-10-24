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

export function NumberPad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 select-none">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "del" ? "Delete" : k}
          onClick={() => onKey(k)}
          className="press grid h-12 place-items-center rounded-[14px] text-[22px] font-medium active:bg-raised"
        >
          {k === "del" ? <BackspaceIcon size={26} /> : k}
        </button>
      ))}
    </div>
  );
}

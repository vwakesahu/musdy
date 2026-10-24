"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

const FALLBACK = ["#516bf6", "#21c85e", "#f5b70a", "#ff5b3a", "#a66bff", "#2ec5d3"];

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export function TokenIcon({ token, size = 20, className = "" }: { token: { symbol: string; image: string | null }; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = token.image && broken !== token.image ? token.image : null;
  const box = { width: size, height: size };
  if (src) {
    return (
      <span className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-2 after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-white/6 after:ring-inset ${className}`} style={box}>
        <img src={src} alt="" width={size} height={size} onError={() => setBroken(src)} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${className}`}
      style={{ ...box, background: hue(token.symbol), fontSize: Math.max(9, size * (size >= 40 ? 0.26 : 0.42)) }}
    >
      {token.symbol.slice(0, size >= 40 ? 4 : 1).toUpperCase()}
    </span>
  );
}

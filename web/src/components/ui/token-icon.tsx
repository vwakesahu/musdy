"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

const HUES = ["#516bf6", "#21c85e", "#f5b70a", "#ff5b3a", "#a66bff", "#2ec5d3"];
const KNOWN: Record<string, string> = { BTC: "#f7931a", MUSD: "#516bf6" };

function hue(symbol: string) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return KNOWN[symbol.toUpperCase()] ?? HUES[h % HUES.length];
}

export function TokenIcon({ token, size = 20 }: { token: { symbol: string; image: string | null }; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const box = { width: size, height: size };
  if (token.image && broken !== token.image) {
    return (
      <span className="relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-2" style={box}>
        <img src={token.image} alt="" width={size} height={size} onError={() => setBroken(token.image)} className="size-full object-cover" />
        <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-white/[0.06] ring-inset" />
      </span>
    );
  }
  const sym = token.symbol.toUpperCase();
  const glyph = sym === "BTC" ? "₿" : sym === "MUSD" ? "$" : sym.slice(0, 1);
  const c = hue(sym);
  const solid = sym in KNOWN;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-white/[0.06] ring-inset"
      style={{ ...box, background: solid ? c : `color-mix(in srgb, ${c} 18%, var(--surface))`, color: solid ? "#fff" : c, fontSize: Math.max(9, size * 0.44) }}
    >
      {glyph}
    </span>
  );
}

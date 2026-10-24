"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

const TINTS = ["#516bf6", "#21c85e", "#f5b70a", "#ff5b3a", "#a66bff", "#2ec5d3"];

function tint(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function TokenIcon({ token, size = 20, className }: { token: { symbol: string; image: string | null }; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size };
  if (token.image && broken !== token.image) {
    return (
      <img
        src={token.image}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(token.image)}
        className={`shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-white/6 ring-inset ${className ?? ""}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${className ?? ""}`}
      style={{ ...style, background: tint(token.symbol), fontSize: Math.max(9, size * 0.4) }}
    >
      {token.symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

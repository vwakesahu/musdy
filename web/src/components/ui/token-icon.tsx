"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { marbleUri } from "@/lib/art";

type IconToken = { symbol: string; image: string | null; address?: string; name?: string };

export function TokenIcon({ token, size = 20, className = "" }: { token: IconToken; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const seed = token.address ?? `${token.name ?? ""}:${token.symbol}`;
  const art = useMemo(() => marbleUri(seed), [seed]);
  const src = token.image && broken !== token.image ? token.image : art;
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-2 after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-white/6 after:ring-inset ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={src} alt="" width={size} height={size} onError={() => setBroken(src)} className="size-full object-cover" />
    </span>
  );
}

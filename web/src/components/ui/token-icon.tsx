"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { CoinIcon } from "@phosphor-icons/react";
import { chainMeta, isMezo } from "@/lib/xchain";
import { cn } from "@/lib/utils";

type IconToken = { symbol: string; image: string | null; chainId?: number; address?: string; name?: string };

export function ChainBadge({ chainId, size = 16, ring = "ring-bg", className }: { chainId: number; size?: number; ring?: string; className?: string }) {
  const meta = chainMeta(chainId);
  if (!meta) return null;
  return (
    <img
      src={meta.icon}
      alt={meta.name}
      title={meta.name}
      width={size}
      height={size}
      data-testid="chain-badge"
      className={cn("shrink-0 rounded-full bg-surface-2 object-cover ring-2", ring, className)}
      style={{ width: size, height: size }}
    />
  );
}

export function TokenIcon({ token, size = 20, badge = true, className = "" }: { token: IconToken; size?: number; badge?: boolean; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const src = token.image && broken !== token.image ? token.image : null;
  const showBadge = badge && token.chainId !== undefined && !isMezo({ chainId: token.chainId }) && size >= 20;
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <span className="absolute inset-0 grid place-items-center overflow-hidden rounded-full bg-surface-2 text-muted after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-white/6 after:ring-inset">
        {src ? (
          <img src={src} alt="" width={size} height={size} onError={() => setBroken(src)} className="size-full object-cover" />
        ) : (
          <CoinIcon size={Math.round(size * 0.55)} weight="regular" aria-hidden />
        )}
      </span>
      {showBadge && token.chainId !== undefined && (
        <ChainBadge chainId={token.chainId} size={Math.max(12, Math.round(size * 0.38))} className="absolute -right-0.5 -bottom-0.5" />
      )}
    </span>
  );
}

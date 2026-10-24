"use client";
import Link from "next/link";
import type { TokenInfo } from "shared";
import { useLivePrice } from "@/hooks/use-live";
import { compact as short, price, toNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CurveBar } from "./ui/curve-bar";
import { Change } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";
import { tokenHref } from "@/lib/xchain";

export function TokenRow({ token, compact = false }: { token: TokenInfo; compact?: boolean }) {
  const live = useLivePrice(token);
  const p = live?.priceMusd ?? BigInt(token.priceMusd);
  const change = live?.change24h ?? token.change24h;
  const onCurve = token.curveProgress !== null && token.venue === "curve";
  return (
    <Link
      href={tokenHref(token)}
      className={cn("press flex items-center gap-3 transition-colors hover:bg-surface-3 lg:rounded-[14px]", compact ? "min-h-[56px] px-2 py-2" : "min-h-[68px] px-4 py-3 lg:mx-2 lg:px-3")}
      data-testid={compact ? undefined : "token-row"}
    >
      <TokenIcon token={token} size={compact ? 36 : 44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[16px] leading-5 font-medium">{token.symbol}</span>
          {!compact && token.name !== token.symbol && <span className="hidden truncate text-[13px] text-muted sm:inline">{token.name}</span>}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[13px] leading-[17px] text-muted">
          <span className="shrink-0 tabular-nums">${short(toNum(BigInt(token.marketCapMusd)), 1)} MC</span>
          {onCurve && !compact && (
            <span className="w-[96px]">
              <CurveBar progress={token.curveProgress ?? 0} />
            </span>
          )}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[16px] leading-5 font-medium tabular-nums">{price(p)}</span>
        <Change value={change} />
      </span>
    </Link>
  );
}

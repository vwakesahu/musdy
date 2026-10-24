"use client";
import Link from "next/link";
import type { TokenInfo } from "shared";
import { useLivePrice } from "@/hooks/use-live";
import { price, usd } from "@/lib/format";
import { CurveBar } from "./ui/curve-bar";
import { PctChip } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";

export function TokenRow({ token }: { token: TokenInfo }) {
  const live = useLivePrice(token.address);
  const p = live?.priceMusd ?? BigInt(token.priceMusd);
  const change = live?.change24h ?? token.change24h;
  return (
    <Link href={`/token/${token.address}`} className="press flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-3" data-testid="token-row">
      <TokenIcon token={token} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[22px] font-semibold">{token.symbol}</span>
        {token.curveProgress !== null && token.venue === "curve" ? (
          <span className="mt-1 block max-w-[160px]">
            <CurveBar progress={token.curveProgress} />
          </span>
        ) : (
          <span className="block truncate text-[14px] leading-5 text-muted">
            {token.name} <span className="text-[12px]">· MC {usd(BigInt(token.marketCapMusd))}</span>
          </span>
        )}
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[15px] leading-[22px] font-medium tabular-nums">{price(p)}</span>
        <PctChip value={change} />
      </span>
    </Link>
  );
}

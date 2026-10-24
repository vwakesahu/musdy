"use client";
import Link from "next/link";
import { RepeatIcon } from "@phosphor-icons/react";
import type { FeedItem } from "shared";
import { useCurrentPrice } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import { displayName, timeAgo, usd } from "@/lib/format";
import { CopyButton } from "./copy-button";
import { UserAvatar } from "./ui/avatar";
import { PctChip } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";
import { tokenHref } from "@/lib/xchain";

export function SideTag({ buy }: { buy: boolean }) {
  return (
    <span className={`rounded-[6px] px-1.5 text-[13px] leading-5 font-semibold ${buy ? "bg-up-soft text-up-sm" : "bg-down-soft text-down"}`}>
      {buy ? "Buy" : "Sell"}
    </span>
  );
}

export function FeedRow({ item, self }: { item: FeedItem; self: boolean }) {
  const now = useNow();
  const current = useCurrentPrice(item.token);
  const at = BigInt(item.priceMusd);
  const mc = BigInt(item.marketCapMusd);
  const since = item.isBuy && current !== null && at > 0n ? Number(((current - at) * 10_000n) / at) / 10_000 : null;

  return (
    <div
      className="group/row relative flex items-center gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-surface/60 lg:px-6"
      data-testid="feed-row"
      data-id={item.id}
      data-user={item.user.address.toLowerCase()}
      data-side={item.isBuy ? "buy" : "sell"}
    >
      <Link href={tokenHref(item.token)} className="absolute inset-0" aria-label={`${item.token.symbol} details`} />
      <Link href={`/u/${item.user.address}`} className="relative z-10 shrink-0 self-start" aria-label={displayName(item.user)}>
        <UserAvatar user={item.user} size={40} />
      </Link>
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[16px] leading-5 font-medium">{displayName(item.user)}</span>
          <SideTag buy={item.isBuy} />
          {now > 0 && <span className="shrink-0 text-[14px] leading-5 text-muted">{timeAgo(item.ts, now)}</span>}
        </div>
        <div className="mt-2.5 flex items-center gap-2.5 text-[16px] leading-5">
          <TokenIcon token={item.token} size={32} />
          <span className="-mb-2 flex h-7 min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-6 overflow-hidden">
            <span className="-mb-2 min-w-0 truncate pb-2 font-medium uppercase underline decoration-faint decoration-dotted decoration-2 underline-offset-[5px]">{item.token.symbol}</span>
            <span className="shrink-0 tabular-nums">{usd(BigInt(item.musdAmount))}</span>
            {mc > 0n && <span className="shrink-0 text-[14px] whitespace-nowrap text-muted">at {usd(mc)} MC</span>}
          </span>
        </div>
        {item.ref && (
          <p className="mt-2 flex items-center gap-1 text-[13px] leading-[17px] text-muted">
            <RepeatIcon size={14} weight="bold" />
            copied {displayName(item.ref)}
          </p>
        )}
      </div>
      {(since !== null || (item.isBuy && !self)) && (
        <div className="flex shrink-0 flex-col items-end justify-end gap-1.5 self-stretch">
          {since !== null && (
            <span data-testid="since-buy" className="pointer-events-none">
              <PctChip value={since} />
            </span>
          )}
          {item.isBuy && !self && <CopyButton item={item} />}
        </div>
      )}
    </div>
  );
}

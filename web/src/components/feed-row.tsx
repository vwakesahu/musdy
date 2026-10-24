"use client";
import Link from "next/link";
import type { FeedItem } from "shared";
import { useCurrentPrice } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import { displayName, timeAgo, usd } from "@/lib/format";
import { CopyButton } from "./copy-button";
import { Avatar } from "./ui/avatar";
import { Icon } from "./ui/icon";
import { PctChip } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";

export function FeedRow({ item, self }: { item: FeedItem; self: boolean }) {
  const now = useNow();
  const current = useCurrentPrice(item.token.address);
  const at = BigInt(item.priceMusd);
  // how this buy has done since, from the token's price now
  const since = item.isBuy && current !== null && at > 0n ? Number(((current - at) * 10_000n) / at) / 10_000 : null;

  return (
    <div className="relative flex min-h-[72px] items-center gap-3 border-b border-line px-4 py-3" data-testid="feed-row" data-id={item.id} data-user={item.user.address.toLowerCase()} data-side={item.isBuy ? "buy" : "sell"}>
      <Link href={`/token/${item.token.address}`} className="absolute inset-0" aria-label={`${item.token.symbol} details`} />
      <Link href={`/u/${item.user.address}`} className="relative z-10 -mx-0.5 grid h-11 w-11 shrink-0 place-items-center" aria-label={displayName(item.user)}>
        <Avatar user={item.user} />
      </Link>
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-[22px] font-semibold">{displayName(item.user)}</span>
          <span
            className={`rounded-full px-1.5 text-[12px] leading-[18px] font-medium ${item.isBuy ? "bg-up/12 text-up" : "bg-down/12 text-down"}`}
          >
            {item.isBuy ? "Buy" : "Sell"}
          </span>
          {now > 0 && <span className="text-[12px] leading-4 font-medium text-muted">{timeAgo(item.ts, now)}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[14px] leading-5">
          <TokenIcon token={item.token} />
          <span className="font-semibold">{item.token.symbol}</span>
          <span className="truncate">
            {usd(BigInt(item.musdAmount))} <span className="text-muted">at {usd(BigInt(item.marketCapMusd))} MC</span>
          </span>
          {since !== null && (
            <span data-testid="since-buy" className="shrink-0">
              <PctChip value={since} />
            </span>
          )}
        </div>
        {item.ref && <p className="mt-0.5 text-[12px] leading-4 font-medium text-muted">copied {displayName(item.ref)}</p>}
      </div>
      {item.isBuy && !self ? <CopyButton item={item} /> : <Icon name="chevron" size={20} className="text-muted" />}
    </div>
  );
}

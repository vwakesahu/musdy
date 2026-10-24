"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/http";
import { displayName, price, signedBig, usd } from "@/lib/format";
import { RightRail } from "./right-rail";
import { UserAvatar } from "./ui/avatar";
import { Medal } from "./ui/medal";
import { Pnl } from "./ui/pnl";
import { Skeleton } from "./ui/skeleton";
import { TokenIcon } from "./ui/token-icon";
import { keyOf, tokenHref } from "@/lib/xchain";

function Change({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`text-[13px] leading-4 font-medium tabular-nums ${value === 0 ? "text-muted" : up ? "text-up" : "text-down"}`}>
      {value !== 0 && <span className="mr-0.5 text-[9px]">{up ? "▲" : "▼"}</span>}
      {Math.abs(value * 100).toFixed(2)}%
    </span>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="text-[17px] leading-[22px] font-medium tracking-[-0.01em]">{title}</h2>
        <Link href={href} className="rounded-md px-2 py-1 text-[14px] font-medium text-accent hover:bg-surface-3">
          See all
        </Link>
      </div>
      {children}
    </section>
  );
}

function Rows({ n }: { n: number }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
      ))}
    </div>
  );
}

export function FeedRail({ traders = true }: { traders?: boolean }) {
  const tokens = useQuery({ queryKey: ["tokens", "trending"], queryFn: () => api.tokens("trending") });
  const board = useQuery({ queryKey: ["leaderboard", "d1"], queryFn: () => api.leaderboard("d1"), enabled: traders });
  return (
    <RightRail>
      <Section title="Trending" href="/explore">
        {tokens.isPending ? (
          <Rows n={5} />
        ) : (
          <ul>
            {(tokens.data ?? []).slice(0, 5).map((t) => (
              <li key={keyOf(t)}>
                <Link href={tokenHref(t)} className="flex h-16 items-center gap-3 rounded-[14px] px-2 transition-colors hover:bg-surface-3">
                  <TokenIcon token={t} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-5 font-medium">{t.symbol}</span>
                    <span className="block truncate text-[13px] leading-[17px] text-muted">{usd(BigInt(t.marketCapMusd))} MC</span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-[15px] leading-5 font-medium tabular-nums">{price(BigInt(t.priceMusd))}</span>
                    <Change value={t.change24h} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {traders && (
      <Section title="Top traders today" href="/leaderboard">
        {board.isPending ? (
          <Rows n={5} />
        ) : (board.data ?? []).length === 0 ? (
          <p className="px-2 py-3 text-[14px] text-muted">No one is ranked yet today.</p>
        ) : (
          <ul>
            {(board.data ?? []).slice(0, 5).map((r) => (
              <li key={r.user.address}>
                <Link href={`/u/${r.user.address}`} className="flex h-16 items-center gap-3 rounded-[14px] px-2 transition-colors hover:bg-surface-3">
                  <span className="grid w-6 place-items-center text-[14px] text-muted tabular-nums">{r.rank <= 3 ? <Medal rank={r.rank as 1 | 2 | 3} /> : r.rank}</span>
                  <UserAvatar user={r.user} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-5 font-medium">{displayName(r.user)}</span>
                    <span className="block truncate text-[13px] leading-[17px] text-muted">{r.trades} trades</span>
                  </span>
                  <Pnl value={signedBig(r.pnlMusd)} className="text-[15px] font-medium" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      )}
    </RightRail>
  );
}

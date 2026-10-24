"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { isAddress } from "viem";
import { FeedList } from "../feed-list";
import { PriceChart } from "../price-chart";
import { TradeSheet } from "../trade-sheet";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { CurveBar } from "../ui/curve-bar";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { PctChip, Pnl } from "../ui/pnl";
import { Skeleton } from "../ui/skeleton";
import { TokenIcon } from "../ui/token-icon";
import { useTradeList } from "@/hooks/use-feed";
import { useLivePrice, useLiveToken, useProfile } from "@/hooks/use-live";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { useTopic } from "@/hooks/use-topic";
import { displayName, price, signedBig, tokenAmount, usd } from "@/lib/format";
import { api, type CandleTf } from "@/lib/http";

const RANGES: { label: string; tf: CandleTf; secs: number }[] = [
  { label: "1H", tf: "1m", secs: 3600 },
  { label: "1D", tf: "5m", secs: 86_400 },
  { label: "1W", tf: "1h", secs: 604_800 },
  { label: "1M", tf: "1d", secs: 2_592_000 },
  { label: "All", tf: "1d", secs: Infinity },
];

export function TokenScreen() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  if (!isAddress(raw)) return <EmptyState title="That isn't a token address" action={<Link href="/explore" className="text-accent">Back to explore</Link>} />;
  return <TokenView address={raw} />;
}

function TokenView({ address }: { address: Address }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { address: me } = useSession();
  const [range, setRange] = useState(1);
  const [sheet, setSheet] = useState<"buy" | "sell" | null>(null);
  const [lastSide, setLastSide] = useState<"buy" | "sell">("buy");
  const [opens, setOpens] = useState(0);

  const info = useQuery({ queryKey: ["token", address.toLowerCase()], queryFn: () => api.token(address) });
  const live = useLiveToken(address);
  const livePrice = useLivePrice(address);
  const token = live ?? info.data;
  const r = RANGES[range];
  const candles = useQuery({ queryKey: ["candles", address.toLowerCase(), r.tf], queryFn: () => api.candles(address, r.tf) });
  const topic = `token:${address.toLowerCase()}`;
  const trades = useTradeList(topic, ["tokenTrades", address.toLowerCase()], () => api.tokenTrades(address));
  const profile = useProfile(me);

  useTopic(topic, (m) => {
    if (m.type === "trade" && !m.replay) {
      void qc.invalidateQueries({ queryKey: ["candles", address.toLowerCase()] });
      void qc.invalidateQueries({ queryKey: ["token", address.toLowerCase()] });
    }
  });

  const position = profile.data?.positions.find((p) => p.token.address.toLowerCase() === address.toLowerCase());
  const held = position ? BigInt(position.amount) : 0n;
  const p = livePrice?.priceMusd ?? (token ? BigInt(token.priceMusd) : 0n);
  const change = livePrice?.change24h ?? token?.change24h ?? 0;

  const now = Math.floor(useNow() / 1000);
  const shown = (candles.data ?? []).filter((c) => r.secs === Infinity || now === 0 || c.t >= now - r.secs);

  const buyers = new Map<string, { user: (typeof trades.items)[number]["user"]; total: bigint }>();
  for (const t of trades.items) {
    if (!t.isBuy) continue;
    const k = t.user.address.toLowerCase();
    buyers.set(k, { user: t.user, total: (buyers.get(k)?.total ?? 0n) + BigInt(t.musdAmount) });
  }
  const topBuyers = [...buyers.values()].sort((a, b) => (b.total > a.total ? 1 : -1)).slice(0, 8);

  if (info.isError && !token) {
    return (
      <>
        <BackBar title="" onBack={() => router.back()} />
        <EmptyState title="Couldn't load this token" body={info.error.message} />
      </>
    );
  }

  const open = (s: "buy" | "sell") => {
    setLastSide(s);
    setOpens((n) => n + 1);
    setSheet(s);
  };

  return (
    <div className="pb-[72px]">
      <BackBar title={token?.symbol ?? ""} onBack={() => router.back()} />
      <section className="px-4 pt-2">
        {token ? (
          <>
            <div className="flex items-center gap-3">
              <TokenIcon token={token} size={56} />
              <div className="min-w-0">
                <p className="truncate text-[15px] leading-[22px] font-medium">{token.name}</p>
                <p className="text-[12px] leading-4 font-medium text-muted">{token.venue === "curve" ? "On launch curve" : "Mezo pool"}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[34px] leading-[38px] font-bold tracking-[-0.02em] tabular-nums" data-testid="token-price">
                {price(p)}
              </span>
              <PctChip value={change} />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-9 w-40" />
          </div>
        )}
      </section>

      <section className="mt-4">
        {candles.isPending ? (
          <Skeleton className="h-[220px] w-full rounded-none" />
        ) : shown.length === 0 ? (
          <div className="grid h-[220px] place-items-center px-6 text-center text-[14px] text-muted">
            {candles.isError ? "Chart unavailable right now" : "No trades in this range yet"}
          </div>
        ) : (
          <PriceChart candles={shown} />
        )}
        <div className="mt-2 flex justify-between px-4">
          {RANGES.map((x, i) => (
            <button
              key={x.label}
              onClick={() => setRange(i)}
              className={`press h-8 rounded-full px-3 text-[13px] font-medium ${i === range ? "bg-raised text-text" : "text-muted"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>

      {position && held > 0n && (
        <section className="mx-4 mt-6 rounded-[20px] bg-surface p-4" data-testid="position-block">
          <p className="label">Your position</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-[24px] leading-7 font-bold tabular-nums">{usd(BigInt(position.valueMusd), true)}</p>
              <p className="text-[13px] text-muted">
                {tokenAmount(held, token?.decimals ?? 18)} {token?.symbol}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Pnl value={signedBig(position.pnlMusd)} className="text-[15px] font-semibold" />
              <PctChip value={position.pnlPct} />
            </div>
          </div>
        </section>
      )}

      {topBuyers.length > 0 && (
        <section className="mt-6">
          <p className="label px-4">Traders who bought</p>
          <ul className="no-scrollbar mt-3 flex gap-4 overflow-x-auto px-4">
            {topBuyers.map((b) => (
              <li key={b.user.address}>
                <Link href={`/u/${b.user.address}`} className="flex w-16 flex-col items-center gap-1">
                  <Avatar user={b.user} />
                  <span className="w-full truncate text-center text-[12px] leading-4 font-medium">{displayName(b.user)}</span>
                  <span className="text-[12px] leading-4 text-muted tabular-nums">{usd(b.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {token && (
        <section className="mt-6 px-4">
          <p className="label">Stats</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
            <Stat label="Market cap" value={usd(BigInt(token.marketCapMusd))} />
            <Stat label="24h volume" value={usd(BigInt(token.volume24hMusd))} />
            <Stat label="Venue" value={token.venue === "curve" ? "Launch curve" : "Mezo pool"} />
            <Stat label="Kind" value={token.kind === "launch" ? "Launched on musdy" : token.kind === "stock" ? "Tokenized stock" : token.kind.toUpperCase()} />
          </dl>
          {token.venue === "curve" && token.curveProgress !== null && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-muted">Curve progress, graduates to a Mezo pool at 100%</p>
              <CurveBar progress={token.curveProgress} />
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <p className="label px-4">Trades</p>
        <FeedList
          items={trades.items}
          loading={trades.loading}
          error={trades.error}
          empty={<EmptyState title="No trades yet" body="The first buy shows up here live." />}
        />
      </section>

      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 mx-auto flex h-[72px] w-full max-w-[480px] items-center gap-3 border-t border-line bg-bg/95 px-4 backdrop-blur-md">
        <Button variant="accent" className="h-[52px] flex-1" disabled={!token} onClick={() => open("buy")} data-testid="open-buy">
          Buy
        </Button>
        <Button variant="raised" className="h-[52px] flex-1" disabled={!token || held === 0n} onClick={() => open("sell")} data-testid="open-sell">
          Sell
        </Button>
      </div>

      {token && (
        <TradeSheet
          key={opens}
          token={token}
          priceMusd={p}
          held={held}
          side={lastSide}
          open={sheet !== null}
          onOpenChange={(o) => !o && setSheet(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] leading-4 font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] leading-[22px] font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-bg/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <button onClick={onBack} aria-label="Back" className="press grid h-11 w-11 place-items-center">
        <Icon name="back" />
      </button>
      <h1 className="flex-1 text-[17px] font-semibold">{title}</h1>
    </header>
  );
}

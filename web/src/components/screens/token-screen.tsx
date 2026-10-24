"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretLeftIcon, CheckIcon, CopySimpleIcon } from "@phosphor-icons/react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { BackBar } from "../back-bar";
import { FeedList } from "../feed-list";
import { PriceChart } from "../price-chart";
import { RightRail } from "../right-rail";
import { SocketBanner } from "../socket-banner";
import { Delta, TradePanel, TradeSheet, type Side } from "../trade-sheet";
import { UserAvatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { CurveBar } from "../ui/curve-bar";
import { EmptyState } from "../ui/empty-state";
import { Pnl } from "../ui/pnl";
import { Skeleton } from "../ui/skeleton";
import { TokenIcon } from "../ui/token-icon";
import { UnderlineTabs } from "../underline-tabs";
import { useTradeList } from "@/hooks/use-feed";
import { useLivePrice, useLiveToken, useProfile } from "@/hooks/use-live";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { useTopic } from "@/hooks/use-topic";
import { cn } from "@/lib/utils";
import { displayName, price, signedBig, tokenAmount, usd } from "@/lib/format";
import { topicKey, type CandleTf, type TokenInfo } from "shared";
import { api } from "@/lib/http";

const RANGES: { label: string; tf: CandleTf; secs: number }[] = [
  { label: "1H", tf: "1m", secs: 3600 },
  { label: "1D", tf: "5m", secs: 86_400 },
  { label: "1W", tf: "1h", secs: 604_800 },
  { label: "1M", tf: "1d", secs: 2_592_000 },
  { label: "ALL", tf: "1d", secs: Infinity },
];

export function TokenScreen() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  if (!isAddress(raw))
    return (
      <>
        <BackBar title="" />
        <EmptyState title="That isn't a token address" action={<Link href="/explore" className="text-accent">Back to explore</Link>} />
      </>
    );
  return <TokenView address={raw} />;
}

function TokenView({ address }: { address: Address }) {
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { address: me } = useSession();
  const [range, setRange] = useState(1);
  const [tab, setTab] = useState<"holders" | "trades">("trades");
  const [sheet, setSheet] = useState<Side | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [opens, setOpens] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const info = useQuery({ queryKey: ["token", address.toLowerCase()], queryFn: () => api.token(address) });
  const live = useLiveToken(address);
  const livePrice = useLivePrice(address);
  const token: TokenInfo | undefined = live ?? info.data;
  const r = RANGES[range];
  const candles = useQuery({ queryKey: ["candles", address.toLowerCase(), r.tf], queryFn: () => api.candles(address, r.tf) });
  const topic = topicKey(`token:${address}`);
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
  const unit = 10n ** BigInt(token?.decimals ?? 18);

  const now = Math.floor(useNow() / 1000);
  const shown = (candles.data ?? []).filter((c) => r.secs === Infinity || now === 0 || c.t >= now - r.secs);

  const buyers = new Map<string, { user: (typeof trades.items)[number]["user"]; total: bigint; net: bigint }>();
  for (const t of trades.items) {
    const k = t.user.address.toLowerCase();
    const cur = buyers.get(k) ?? { user: t.user, total: 0n, net: 0n };
    const amt = BigInt(t.tokenAmount);
    buyers.set(k, t.isBuy ? { ...cur, total: cur.total + BigInt(t.musdAmount), net: cur.net + amt } : { ...cur, net: cur.net - amt });
  }
  const topBuyers = [...buyers.values()]
    .filter((x) => x.total > 0n && x.net > 0n)
    .sort((a, b) => (b.total > a.total ? 1 : -1))
    .slice(0, Math.min(8, token?.holders ?? 8));
  const faces = topBuyers.map((b) => b.user);

  const finish = useCallback(() => {
    setSheet(null);
    setEngaged(false);
    setOpens((n) => n + 1);
  }, []);

  if (info.isError && !token) {
    return (
      <>
        <BackBar title="" />
        <EmptyState title="Couldn't load this token" body={info.error.message} />
      </>
    );
  }

  const open = (s: Side) => {
    if (desktop) {
      if (s !== side) setOpens((n) => n + 1);
      setSide(s);
      setEngaged(true);
      return;
    }
    setSide(s);
    setOpens((n) => n + 1);
    setSheet(s);
  };

  const stats = token && (
    <section className={cn(desktop ? "" : "mt-8 px-4")}>
      <h2 className="text-[17px] leading-[22px] font-medium tracking-[-0.01em]">Stats</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Market cap" value={usd(BigInt(token.marketCapMusd))} />
        <Stat label="24h volume" value={usd(BigInt(token.volume24hMusd))} />
        <Stat label="Holders" value={token.holders.toLocaleString("en-US")} />
        <Stat label="Venue" value={token.venue === "curve" ? "Launch curve" : "Mezo pool"} />
      </dl>
      {token.venue === "curve" && token.curveProgress !== null && (
        <div className="mt-4" data-testid="curve-progress">
          <p className="mb-1.5 text-[13px] text-muted">Curve progress, graduates to a Mezo pool at 100%</p>
          <CurveBar progress={token.curveProgress} />
        </div>
      )}
    </section>
  );

  return (
    <div className={cn(desktop ? "pb-10" : "pb-[96px]")}>
      <TokenHeader token={token} />

      <section className="flex items-start justify-between gap-4 px-4 pt-3 lg:px-6">
        {token ? (
          <>
            <div className="min-w-0">
              <p className="text-[34px] leading-10 font-medium tracking-[-0.02em] tabular-nums" data-testid="token-price">
                {price(p)}
              </p>
              <p className="mt-1 flex items-center gap-1.5">
                <Delta value={change} />
                <span className="text-[13px] leading-4 text-muted">24h</span>
              </p>
            </div>
            <div className="pt-2 text-right">
              <p className="text-[17px] leading-[22px] font-medium tabular-nums">{usd(BigInt(token.marketCapMusd))}</p>
              <p className="text-[13px] leading-[17px] text-muted">Market cap</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </section>

      <section className="mt-4">
        {candles.isPending ? (
          <Skeleton className="h-[280px] w-full rounded-none lg:h-[360px]" />
        ) : shown.length === 0 ? (
          <div className="dot-grid grid h-[280px] place-items-center px-6 text-center text-[14px] text-muted lg:h-[360px]">
            {candles.isError ? "Chart unavailable right now" : "No trades in this range yet"}
          </div>
        ) : (
          <PriceChart candles={shown} />
        )}
        <div className="mt-3 flex gap-1 px-4 lg:px-6">
          {RANGES.map((x, i) => (
            <button
              key={x.label}
              onClick={() => setRange(i)}
              aria-pressed={i === range}
              className={cn(
                "press h-9 flex-1 cursor-pointer rounded-[8px] text-[13px] font-medium tabular-nums lg:flex-none lg:px-4",
                i === range ? "bg-surface-2 text-text" : "text-muted hover:text-text-2",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </section>

      {position && held > 0n && (
        <section className="mx-4 mt-6 border-y border-border py-4 lg:mx-6" data-testid="position-block">
          <h2 className="text-[13px] leading-[17px] text-muted">Your position</h2>
          <div className="mt-1 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[24px] leading-[30px] font-medium tracking-[-0.02em] tabular-nums">{usd(BigInt(position.valueMusd), true)}</p>
              <p className="text-[13px] text-muted tabular-nums">
                {tokenAmount(held, token?.decimals ?? 18)} {token?.symbol}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <Pnl value={signedBig(position.pnlMusd)} className="text-[17px] leading-[22px] font-medium" />
              <Delta value={position.pnlPct} />
            </div>
          </div>
        </section>
      )}

      <UnderlineTabs
        className="mt-6 px-4 lg:px-6"
        tabClassName="lg:flex-none lg:px-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: "trades", label: "Trades" },
          { value: "holders", label: `Holders${token ? ` (${token.holders.toLocaleString("en-US")})` : ""}` },
        ]}
      />

      {tab === "holders" ? (
        topBuyers.length > 0 ? (
          <section className="px-4 pt-3 lg:px-6">
            <p className="text-[13px] text-muted">Traders who bought and still hold</p>
            <ul className="mt-1">
              {topBuyers.map((b) => (
                <li key={b.user.address}>
                  <Link href={`/u/${b.user.address}`} className="-mx-2 flex h-[68px] items-center gap-3 rounded-lg px-2 hover:bg-surface-3">
                    <UserAvatar user={b.user} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] leading-5 font-medium" data-testid="buyer-name">
                        {displayName(b.user, true)}
                      </span>
                      <span className="block text-[13px] leading-[17px] text-muted tabular-nums">Bought {usd(b.total)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[16px] leading-5 font-medium tabular-nums">{usd((b.net * p) / unit, true)}</span>
                      <span className="block text-[13px] leading-[17px] text-muted tabular-nums">
                        {tokenAmount(b.net, token?.decimals ?? 18)} {token?.symbol}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState title="Nobody holds this yet" body="Be the first to buy." />
        )
      ) : (
        <FeedList
          items={trades.items}
          live={trades.live}
          loading={trades.loading}
          error={trades.error}
          empty={<EmptyState title="No trades yet" body="The first buy shows up here live." />}
        />
      )}

      {!desktop && stats}

      {desktop ? (
        token && (
          <RightRail>
            <section>
              <div className="flex rounded-md bg-surface-2 p-1" role="tablist" aria-label="Trade side">
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={side === s}
                    disabled={!token || (s === "sell" && held === 0n && side !== "sell")}
                    onClick={() => open(s)}
                    data-testid={s === "buy" ? "open-buy" : "open-sell"}
                    className={cn(
                      "h-9 flex-1 cursor-pointer rounded-[8px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                      side === s ? "bg-surface-3 text-text" : "text-muted hover:text-text-2",
                    )}
                  >
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>
              <div className="mt-5" data-testid={engaged ? "trade-sheet" : undefined} onPointerDown={() => setEngaged(true)}>
                <TradePanel
                  key={`${side}-${opens}`}
                  token={token}
                  priceMusd={p}
                  change={change}
                  held={held}
                  side={side}
                  faces={faces}
                  holders={token.holders}
                  active
                  compactPad
                  onDone={finish}
                />
              </div>
            </section>
            <div className="border-t border-border pt-5">{stats}</div>
          </RightRail>
        )
      ) : (
        <>
          <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 mx-auto flex w-full max-w-[720px] gap-3 bg-bg px-4 pt-2 pb-3 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-bg before:to-transparent">
            {held > 0n && (
              <Button variant="secondary" size="lg" className="flex-1" disabled={!token} onClick={() => open("sell")} data-testid="open-sell">
                Sell
              </Button>
            )}
            <Button variant="buy" size="lg" className={cn("text-white", held > 0n ? "flex-[2]" : "flex-1")} disabled={!token} onClick={() => open("buy")} data-testid="open-buy">
              Buy
            </Button>
          </div>
          {token && (
            <TradeSheet
              key={opens}
              token={token}
              priceMusd={p}
              change={change}
              held={held}
              side={side}
              faces={faces}
              holders={token.holders}
              open={sheet !== null}
              onOpenChange={(o) => !o && setSheet(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function TokenHeader({ token }: { token: TokenInfo | undefined }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  const copy = () => {
    if (!token) return;
    void navigator.clipboard?.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-bg/80 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-[16px] lg:h-[72px] lg:px-4">
        <button onClick={back} aria-label="Back" className="press grid size-11 cursor-pointer place-items-center rounded-full hover:bg-surface-3">
          <CaretLeftIcon size={22} weight="bold" />
        </button>
        {token ? (
          <div className="flex min-w-0 items-center gap-3">
            <TokenIcon token={token} size={40} />
            <div className="min-w-0">
              <h1 className="truncate text-[17px] leading-[22px] font-medium">{token.symbol}</h1>
              <button onClick={copy} className="flex max-w-full cursor-pointer items-center gap-1 text-[13px] leading-[17px] text-muted hover:text-text-2" aria-label="Copy token address">
                <span className="truncate">{token.name}</span>
                {copied ? <CheckIcon size={13} weight="bold" className="text-up" /> : <CopySimpleIcon size={13} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        )}
      </header>
      <SocketBanner />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] leading-[17px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[16px] leading-5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

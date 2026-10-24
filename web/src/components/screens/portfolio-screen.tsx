"use client";
import Link from "next/link";
import { LoginGate } from "../login-gate";
import { PositionRow } from "../position-row";
import { RightRail } from "../right-rail";
import { ScreenHeader } from "../screen-header";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ArrowUpIcon, CurrencyDollarSimpleIcon, LockSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { Pnl } from "../ui/pnl";
import { Skeleton } from "../ui/skeleton";
import { useCash, useProfile } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { signedBig, usd } from "@/lib/format";
import { openSheet } from "@/lib/ui";

export function PortfolioScreen() {
  return (
    <>
      <ScreenHeader title="Portfolio" />
      <LoginGate title="Your money, in one number" body="Log in to get a USD balance you can trade stocks, BTC and new coins from.">
        <Portfolio />
      </LoginGate>
    </>
  );
}

function Big({ value }: { value: bigint }) {
  const s = usd(value, true);
  const dot = s.lastIndexOf(".");
  return (
    <>
      {s.slice(0, dot)}
      <span className="text-faint">{s.slice(dot)}</span>
    </>
  );
}

function Portfolio() {
  const { address } = useSession();
  const profile = useProfile(address);
  const cash = useCash();
  const p = profile.data;
  const positions = (p?.positions ?? []).filter((x) => BigInt(x.amount) > 0n);
  const posValue = positions.reduce((s, x) => s + BigInt(x.valueMusd), 0n);
  const total = cash !== null && p ? cash + posValue : p ? BigInt(p.totalValueMusd) : null;
  const pnlAll = p ? signedBig(p.pnl.all) : 0n;
  const pnl24 = p ? signedBig(p.pnl.d1) : 0n;
  const locked = positions.filter((x) => !x.withdrawable);

  return (
    <div className="flex flex-col pb-6">
      <section className="flex flex-col gap-5 px-4 pt-3 pb-6 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="min-w-0">
          {total === null ? (
            profile.isError ? (
              <p className="text-[14px] text-muted">Can&apos;t reach the musdy server. Your balance shows once it&apos;s back.</p>
            ) : (
              <Skeleton className="h-11 w-52" />
            )
          ) : (
            <p className="text-[40px] leading-[44px] font-medium tracking-[-0.03em] tabular-nums lg:text-[48px] lg:leading-[52px]" data-testid="portfolio-total">
              <Big value={total} />
            </p>
          )}
          {p && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[15px] leading-5 font-medium">
              <Pnl value={pnl24} />
              <span className="text-muted">24h</span>
              <span className="mx-1 text-faint">·</span>
              <Pnl value={pnlAll} />
              <span className="text-muted">all time</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:shrink-0">
          <Button variant="primary" onClick={() => openSheet("deposit")} data-testid="open-deposit" className="sm:w-[140px]">
            <PlusIcon weight="bold" /> Deposit
          </Button>
          <Button variant="secondary" onClick={() => openSheet("withdraw")} data-testid="open-withdraw" className="sm:w-[140px]">
            <ArrowUpIcon weight="bold" /> Withdraw
          </Button>
        </div>
      </section>

      <section className="flex items-center gap-3 border-y border-border px-4 py-4 lg:px-6">
        <span className="grid size-11 place-items-center rounded-full bg-surface-2">
          <CurrencyDollarSimpleIcon size={22} weight="bold" />
        </span>
        <span className="flex-1">
          <span className="block text-[13px] leading-[17px] text-muted">Cash</span>
          <span className="block text-[17px] leading-[22px] font-medium tabular-nums" data-testid="portfolio-cash">
            {cash === null ? <Skeleton className="h-5 w-20" /> : usd(cash, true)}
          </span>
        </span>
        <span className="text-[13px] text-muted">Ready to trade</span>
      </section>

      <h2 className="px-4 pt-6 pb-2 text-[17px] leading-[22px] font-medium tracking-[-0.01em] lg:px-6">
        Positions {positions.length > 0 && <span className="text-muted">({positions.length})</span>}
      </h2>
      {profile.isPending ? (
        <Skeleton className="mx-4 mt-3 h-16" />
      ) : positions.length === 0 ? (
        <EmptyState
          title="No positions yet"
          body="Anything you buy shows up here with its value and PnL."
          action={
            <Button variant="primary" size="sm" render={<Link href="/explore" />}>
              Explore coins and stocks
            </Button>
          }
        />
      ) : (
        <ul>
          {positions.map((x) => (
            <li key={x.token.address}>
              <PositionRow position={x} />
            </li>
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <p className="flex items-start gap-2 px-4 pt-4 text-[13px] leading-5 text-muted lg:px-6">
          <LockSimpleIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
          {locked.map((x) => x.token.symbol).join(", ")} {locked.length === 1 ? "is" : "are"} still on the launch curve. You can sell any time, and withdraw once the coin graduates.
        </p>
      )}

      <RightRail>
        <section>
          <h2 className="mb-3 text-[17px] leading-[22px] font-medium tracking-[-0.01em]">Summary</h2>
          <dl className="divide-y divide-border border-y border-border text-[15px]">
            {[
              ["Cash", cash === null ? "…" : usd(cash, true)],
              ["In positions", usd(posValue, true)],
              ["Open positions", String(positions.length)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium tabular-nums">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <dt className="text-muted">All-time PnL</dt>
              <dd className="font-medium">
                <Pnl value={pnlAll} />
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h2 className="mb-1 text-[17px] leading-[22px] font-medium tracking-[-0.01em]">Add money</h2>
          <p className="mb-3 text-[14px] leading-5 text-muted">Send MUSD or BTC on Mezo to your address. It lands in your cash on its own.</p>
          <Button variant="secondary" className="w-full" onClick={() => openSheet("deposit")}>
            Show deposit address
          </Button>
        </section>
      </RightRail>
    </div>
  );
}

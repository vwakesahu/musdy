"use client";
import Link from "next/link";
import { LoginGate } from "../login-gate";
import { PositionRow } from "../position-row";
import { ScreenHeader } from "../screen-header";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ArrowUpIcon, LockSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { Money } from "../ui/money";
import { Pnl } from "../ui/pnl";
import { Skeleton } from "../ui/skeleton";
import { useCash, useProfile } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { signedBig } from "@/lib/format";
import { openSheet } from "@/lib/ui";

export function PortfolioScreen() {
  return (
    <>
      <ScreenHeader title="Portfolio" />
      <LoginGate title="Your money, in one number" body="Log in to get a USD balance you can trade from.">
        <Portfolio />
      </LoginGate>
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
  const locked = positions.filter((x) => !x.withdrawable);

  return (
    <div className="flex flex-col">
      <section className="px-4 pt-2 pb-6">
        <p className="label">Total</p>
        {total === null ? (
          profile.isError ? (
            <p className="mt-2 text-[14px] text-muted">Can&apos;t reach the musdy server. Your balance shows once it&apos;s back.</p>
          ) : (
            <Skeleton className="mt-2 h-11 w-52" />
          )
        ) : (
          <p className="mt-1 text-[40px] leading-[44px] font-bold tracking-[-0.03em]" data-testid="portfolio-total">
            <Money value={total} />
          </p>
        )}
        {p && (
          <p className="mt-2 flex items-center gap-2 text-[14px]">
            <Pnl value={pnlAll} className="font-semibold" />
            <span className="text-muted">all time</span>
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="primary" size="lg" onClick={() => openSheet("deposit")} data-testid="open-deposit">
            <PlusIcon size={20} weight="bold" /> Add cash
          </Button>
          <Button variant="secondary" size="lg" onClick={() => openSheet("withdraw")} data-testid="open-withdraw">
            <ArrowUpIcon size={20} weight="bold" /> Withdraw
          </Button>
        </div>
      </section>

      <section className="mx-4 mb-6 flex items-center justify-between rounded-[20px] bg-surface p-4">
        <span>
          <span className="block text-[12px] leading-4 font-medium text-muted">Cash</span>
          <span className="text-[20px] leading-[26px] font-semibold" data-testid="portfolio-cash">
            {cash === null ? <Skeleton className="h-5 w-20" /> : <Money value={cash} />}
          </span>
        </span>
        <span className="text-right text-[12px] leading-4 text-muted">ready to trade</span>
      </section>

      <p className="label px-4">Positions</p>
      {profile.isPending ? (
        <Skeleton className="mx-4 mt-3 h-16" />
      ) : positions.length === 0 ? (
        <EmptyState
          title="No positions yet"
          body="Anything you buy shows up here with its cost, value and PnL."
          action={
            <Link href="/explore" className="text-[15px] font-semibold text-accent">
              Explore coins and stocks
            </Link>
          }
        />
      ) : (
        <ul className="mt-2">
          {positions.map((x) => (
            <li key={x.token.address}>
              <PositionRow position={x} />
            </li>
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <p className="flex items-start gap-2 px-4 pt-3 text-[13px] leading-5 text-muted">
          <LockSimpleIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
          {locked.map((x) => x.token.symbol).join(", ")} {locked.length === 1 ? "is" : "are"} still on the launch curve. You can sell any time, and withdraw once the coin graduates.
        </p>
      )}
    </div>
  );
}

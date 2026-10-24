"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react";
import { useIsRailWide } from "@/hooks/use-media-query";
import { useSession } from "@/hooks/use-session";
import { openSheet } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { BalancePill } from "./balance-pill";
import { NAV } from "./nav-items";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function NavRail() {
  return (
    <Suspense fallback={<NavRailView path="" />}>
      <LiveNavRail />
    </Suspense>
  );
}

function LiveNavRail() {
  return <NavRailView path={usePathname() ?? ""} />;
}

function NavRailView({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-border px-3 py-5 lg:flex xl:px-4">
      <Link href="/" aria-label="musdy home" className="mb-6 flex h-10 items-center px-2">
        <img src="/brand/mark.svg" alt="" className="h-8 w-8 xl:hidden" />
        <img src="/brand/wordmark.svg" alt="" className="hidden h-8 w-auto xl:block" />
      </Link>
      {NAV.map((t) => {
        const active = t.match(path);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press flex h-11 items-center justify-center gap-3 rounded-[12px] px-3 text-[15px] font-medium transition-colors xl:justify-start",
              active ? "bg-surface text-text" : "text-muted hover:bg-surface-3 hover:text-text",
            )}
          >
            <Icon size={22} weight={active ? "fill" : "regular"} />
            <span className="hidden lowercase xl:inline">{t.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto">
        <BalanceCard />
      </div>
    </nav>
  );
}

function BalanceCard() {
  const { address, ready } = useSession();
  const wide = useIsRailWide();
  if (!wide) {
    return (
      <Button variant="primary" size="icon" className="mx-auto" aria-label="Deposit" onClick={() => openSheet(address ? "deposit" : "login")}>
        <PlusIcon weight="bold" />
      </Button>
    );
  }
  if (!ready) return <Skeleton className="h-32 w-full rounded-xl" />;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <p className="text-[13px] leading-[17px] text-muted">{address ? "your cash" : "see what they buy. buy it first."}</p>
      <BalancePill />
      {address && (
        <Button variant="primary" size="md" className="w-full" onClick={() => openSheet("deposit")}>
          <PlusIcon weight="bold" />
          deposit
        </Button>
      )}
    </div>
  );
}

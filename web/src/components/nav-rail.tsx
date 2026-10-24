"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useIsRailWide } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { RailBalance } from "./balance-pill";
import { NAV } from "./nav-items";

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
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col gap-1 px-3 py-5 lg:flex xl:px-4">
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
              "press flex h-12 items-center justify-center gap-3.5 rounded-[12px] px-3 text-[16px] font-medium transition-colors xl:justify-start",
              active ? "bg-surface text-text" : "text-muted hover:bg-surface-3 hover:text-text",
            )}
          >
            <Icon size={24} weight={active ? "fill" : "regular"} />
            <span className="hidden xl:inline">{t.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto pb-2">
        <BalanceCard />
      </div>
    </nav>
  );
}

function BalanceCard() {
  return useIsRailWide() ? <RailBalance /> : null;
}

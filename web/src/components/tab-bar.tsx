"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-items";

export function TabBar() {
  return (
    <Suspense fallback={<TabBarView path="" />}>
      <LiveTabBar />
    </Suspense>
  );
}

function LiveTabBar() {
  return <TabBarView path={usePathname() ?? ""} />;
}

function TabBarView({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto flex h-14 max-w-[720px] items-stretch">
        {NAV.filter((t) => t.phone).map((t) => {
          const active = t.match(path);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className={cn("press flex h-full flex-col items-center justify-center gap-0.5 transition-colors", active ? "text-text" : "text-muted hover:text-text-2")}
              >
                <Icon size={24} weight={active ? "fill" : "regular"} />
                <span className="text-[10px] leading-3 font-medium">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui/icon";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Feed", icon: "feed", match: (p) => p === "/" },
  { href: "/explore", label: "Explore", icon: "explore", match: (p) => p.startsWith("/explore") || p.startsWith("/token") },
  { href: "/launch", label: "Launch", icon: "launch", match: (p) => p.startsWith("/launch") },
  { href: "/portfolio", label: "Portfolio", icon: "portfolio", match: (p) => p.startsWith("/portfolio") },
  { href: "/profile", label: "Profile", icon: "profile", match: (p) => p.startsWith("/profile") || p.startsWith("/u/") || p.startsWith("/leaderboard") },
];

export function TabBar() {
  return (
    <Suspense fallback={<Tabs path="" />}>
      <LiveTabs />
    </Suspense>
  );
}

function LiveTabs() {
  return <Tabs path={usePathname()} />;
}

function Tabs({ path }: { path: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex h-14 items-stretch">
        {TABS.map((t) => {
          const active = t.match(path);
          const center = t.icon === "launch";
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className={`press relative flex h-full flex-col items-center justify-center gap-0.5 ${active ? "text-text" : "text-muted"}`}
              >
                {center ? (
                  <span className={`-mt-5 grid h-12 w-12 place-items-center rounded-full border border-line bg-raised shadow-lg shadow-black/50 ${active ? "text-accent" : "text-text"}`}>
                    <Icon name="launch" />
                  </span>
                ) : (
                  <Icon name={t.icon} />
                )}
                {active && <span className="text-[10px] leading-3 font-medium">{t.label}</span>}
                {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

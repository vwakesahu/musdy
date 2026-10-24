"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useIsRailWide } from "@/hooks/use-media-query";
import { useProfile } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { displayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RailBalance } from "./balance-pill";
import { ProfileLink } from "./header-account";
import { NAV, NAV_MORE, type NavItem } from "./nav-items";

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

function Item({ t, path }: { t: NavItem; path: string }) {
  const active = t.match(path);
  const Icon = t.icon;
  return (
    <Link
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
}

function NavRailView({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col gap-1 px-3 py-5 lg:flex xl:px-4">
      <Link href="/" aria-label="musdy home" className="mb-6 flex h-10 items-center px-2">
        <img src="/brand/mark.svg" alt="" className="h-8 w-8 xl:hidden" />
        <img src="/brand/wordmark.svg" alt="" className="hidden h-8 w-auto xl:block" />
      </Link>
      {NAV.map((t) => (
        <Item key={t.href} t={t} path={path} />
      ))}
      <hr className="mx-3 my-2 border-border" />
      {NAV_MORE.map((t) => (
        <Item key={t.href} t={t} path={path} />
      ))}
      <RailFooter />
    </nav>
  );
}

function RailFooter() {
  if (!useIsRailWide()) return null;
  return (
    <div className="mt-auto flex flex-col gap-4 pb-2">
      <RailBalance />
      <UserChip />
    </div>
  );
}

function UserChip() {
  const { address } = useSession();
  const user = useProfile(address).data?.user;
  if (!address) return null;
  return (
    <ProfileLink address={address} size={36} className="flex h-14 items-center gap-3 rounded-[14px] px-2 transition-colors hover:bg-surface-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-medium">{displayName(user ?? { address, handle: null, avatar: null })}</span>
        <span className="block text-[13px] leading-[17px] text-muted">View profile</span>
      </span>
      <CaretRightIcon size={16} weight="bold" className="text-muted" />
    </ProfileLink>
  );
}

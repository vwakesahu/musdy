import { LightningIcon, MagnifyingGlassIcon, RocketIcon, TrophyIcon, WalletIcon, type Icon } from "@phosphor-icons/react";

export type NavItem = { href: string; label: string; icon: Icon; match: (p: string) => boolean };

export const NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: LightningIcon, match: (p) => p === "/" },
  { href: "/explore", label: "Explore", icon: MagnifyingGlassIcon, match: (p) => p.startsWith("/explore") || p.startsWith("/token") },
  { href: "/portfolio", label: "Portfolio", icon: WalletIcon, match: (p) => p.startsWith("/portfolio") },
];

export const NAV_MORE: NavItem[] = [
  { href: "/launch", label: "Launch", icon: RocketIcon, match: (p) => p.startsWith("/launch") },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon, match: (p) => p.startsWith("/leaderboard") },
];

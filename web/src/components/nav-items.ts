import { LightningIcon, MagnifyingGlassIcon, RocketIcon, TrophyIcon, UserCircleIcon, WalletIcon, type Icon } from "@phosphor-icons/react";

export type NavItem = { href: string; label: string; icon: Icon; phone: boolean; match: (p: string) => boolean };

export const NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: LightningIcon, phone: true, match: (p) => p === "/" },
  { href: "/explore", label: "Explore", icon: MagnifyingGlassIcon, phone: true, match: (p) => p.startsWith("/explore") || p.startsWith("/token") },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon, phone: false, match: (p) => p.startsWith("/leaderboard") },
  { href: "/launch", label: "Launch", icon: RocketIcon, phone: true, match: (p) => p.startsWith("/launch") },
  { href: "/portfolio", label: "Portfolio", icon: WalletIcon, phone: true, match: (p) => p.startsWith("/portfolio") },
  { href: "/profile", label: "Profile", icon: UserCircleIcon, phone: true, match: (p) => p.startsWith("/profile") },
];

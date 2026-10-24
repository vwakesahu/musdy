"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsRailWide } from "@/hooks/use-media-query";
import { useProfile } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { openSheet } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./ui/avatar";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function HeaderAccount() {
  return useIsRailWide() ? null : <Account />;
}

function Account() {
  const { address, ready } = useSession();
  if (!ready) return <Skeleton className="size-9 rounded-full" />;
  if (!address)
    return (
      <Button variant="primary" size="sm" className="px-4" onClick={() => openSheet("login")}>
        Log in
      </Button>
    );
  return <ProfileLink address={address} size={32} className="grid size-11 shrink-0 place-items-center rounded-full -mr-1.5" />;
}

export function ProfileLink({ address, size, className, children }: { address: `0x${string}`; size: number; className?: string; children?: React.ReactNode }) {
  const path = usePathname() ?? "";
  const user = useProfile(address).data?.user ?? { address, handle: null, avatar: null };
  const active = path.startsWith("/profile");
  return (
    <Link href="/profile" aria-label="Profile" aria-current={active ? "page" : undefined} className={cn("press cursor-pointer", className)} data-testid="profile-link">
      <span className={cn("rounded-full ring-2 ring-offset-2 ring-offset-bg transition-shadow", active ? "ring-accent-hi" : "ring-transparent")}>
        <UserAvatar user={user} size={size} />
      </span>
      {children}
    </Link>
  );
}

"use client";
import { useCash } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { openSheet } from "@/lib/ui";
import { Button } from "./ui/button";
import { Money } from "./ui/money";
import { Skeleton } from "./ui/skeleton";

export function MusdMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="7" fill="#516bf6" />
      <path d="M4 9.5V4.6l3 3 3-3v4.9" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BalancePill() {
  const { address, ready } = useSession();
  const cash = useCash();
  if (!ready) return <Skeleton className="h-11 w-24 rounded-full" />;
  if (!address) {
    return (
      <Button variant="secondary" size="sm" className="h-10 px-4" onClick={() => openSheet("login")}>
        log in
      </Button>
    );
  }
  return (
    <button
      onClick={() => openSheet("deposit")}
      aria-label="Balance, add cash"
      data-testid="balance-pill"
      className="press flex h-10 items-center gap-2 rounded-full border border-border-strong bg-surface pr-3.5 pl-2.5 text-[15px] font-semibold transition-colors hover:bg-surface-3"
    >
      <MusdMark />
      {cash === null ? <Skeleton className="h-4 w-14" /> : <Money value={cash} />}
    </button>
  );
}

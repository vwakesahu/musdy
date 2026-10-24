"use client";
import { PlusIcon } from "@phosphor-icons/react";
import { useCash } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { usd } from "@/lib/format";
import { openSheet } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

export function Cash({ value, className }: { value: bigint; className?: string }) {
  const s = usd(value, true);
  const dot = s.lastIndexOf(".");
  return (
    <span className={cn("tabular-nums", className)}>
      {dot < 0 ? s : s.slice(0, dot)}
      {dot >= 0 && <span className="text-faint">{s.slice(dot)}</span>}
    </span>
  );
}

export function BalancePill() {
  const { address, ready } = useSession();
  const cash = useCash();
  if (!ready) return <Skeleton className="h-9 w-28 rounded-[10px]" />;
  if (!address) {
    return (
      <Button variant="primary" size="sm" className="px-4" onClick={() => openSheet("login")}>
        Log in
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => openSheet("deposit")}
        aria-label="Balance, add cash"
        data-testid="balance-pill"
        className="press h-9 cursor-pointer rounded-[10px] px-1.5 text-[17px] leading-[22px] font-medium tracking-[-0.01em] hover:bg-surface-3"
      >
        {cash === null ? <Skeleton className="h-4 w-16" /> : <Cash value={cash} />}
      </button>
      <Button variant="primary" size="sm" className="px-3" onClick={() => openSheet("deposit")} aria-label="Deposit">
        <PlusIcon weight="bold" />
        <span className="max-[359px]:hidden">Deposit</span>
      </Button>
    </div>
  );
}

export function RailBalance() {
  const { address, ready } = useSession();
  const cash = useCash();
  if (!ready) return <Skeleton className="h-28 w-full rounded-[14px]" />;
  if (!address) {
    return (
      <div className="flex flex-col gap-3 px-2">
        <p className="text-[15px] leading-[21px] text-text-2">See what traders buy. Buy it first.</p>
        <Button variant="primary" size="md" className="w-full" onClick={() => openSheet("login")}>
          Log in
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 px-2">
      <div>
        <p className="text-[13px] leading-[17px] text-muted">Cash</p>
        <button
          onClick={() => openSheet("deposit")}
          aria-label="Balance, add cash"
          data-testid="balance-pill"
          className="cursor-pointer text-left text-[28px] leading-[34px] font-medium tracking-[-0.03em] hover:opacity-80"
        >
          {cash === null ? <Skeleton className="h-7 w-32" /> : <Cash value={cash} />}
        </button>
      </div>
      <Button variant="primary" size="md" className="w-full" onClick={() => openSheet("deposit")}>
        Deposit
      </Button>
    </div>
  );
}

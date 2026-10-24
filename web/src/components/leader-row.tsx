import Link from "next/link";
import type { LeaderRow as Row } from "shared";
import { displayName, signedBig } from "@/lib/format";
import { UserAvatar } from "./ui/avatar";
import { Medal } from "./ui/medal";
import { Pnl } from "./ui/pnl";

export function LeaderRow({ row, self }: { row: Row; self: boolean }) {
  const pct = row.pnlPct * 100;
  return (
    <Link
      href={`/u/${row.user.address}`}
      className={`flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-3 lg:px-6 ${self ? "bg-surface" : ""}`}
      data-testid="leader-row"
      data-user={row.user.address.toLowerCase()}
    >
      <span className="grid w-7 shrink-0 place-items-center text-[15px] text-muted tabular-nums">
        {row.rank <= 3 ? <Medal rank={row.rank as 1 | 2 | 3} /> : `${row.rank}.`}
      </span>
      <UserAvatar user={row.user} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-[22px] font-medium">{displayName(row.user)}</span>
        <span className="block truncate text-[14px] leading-5 text-muted">
          {row.user.handle ? `@${row.user.handle}` : `${row.trades} trades`}
          {self && " · you"}
        </span>
      </span>
      <span className="flex flex-col items-end">
        <Pnl value={signedBig(row.pnlMusd)} className="text-[17px] leading-[22px] font-medium" data-testid="leader-pnl" />
        {Number.isFinite(pct) && pct !== 0 && (
          <span className={`text-[13px] leading-[17px] font-medium tabular-nums ${pct > 0 ? "text-up" : "text-down"}`}>
            <span className="mr-0.5 text-[9px]">{pct > 0 ? "▲" : "▼"}</span>
            {Math.abs(pct).toFixed(2)}%
          </span>
        )}
      </span>
    </Link>
  );
}

import Link from "next/link";
import type { LeaderRow as Row } from "shared";
import { displayName, signedBig } from "@/lib/format";
import { Avatar } from "./ui/avatar";
import { Medal } from "./ui/medal";
import { Pnl } from "./ui/pnl";

export function LeaderRow({ row, self }: { row: Row; self: boolean }) {
  return (
    <Link
      href={`/u/${row.user.address}`}
      className={`press flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-3 ${self ? "bg-surface" : ""}`}
      data-testid="leader-row"
    >
      <span className="grid w-7 place-items-center text-[14px] font-semibold text-muted tabular-nums">
        {row.rank <= 3 ? <Medal rank={row.rank as 1 | 2 | 3} /> : row.rank}
      </span>
      <Avatar user={row.user} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[22px] font-semibold">
          {displayName(row.user)}
          {self && <span className="ml-1.5 text-[12px] font-medium text-muted">you</span>}
        </span>
        <span className="block truncate text-[14px] leading-5 text-muted">
          {row.user.handle ? `@${row.user.handle}` : `${row.trades} trades`}
        </span>
      </span>
      <Pnl value={signedBig(row.pnlMusd)} className="text-[15px] font-semibold" />
    </Link>
  );
}

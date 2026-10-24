"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PnlWindow } from "shared";
import { RowSkeletons } from "../feed-list";
import { FeedRail } from "../feed-rail";
import { LeaderRow } from "../leader-row";
import { ScreenHeader } from "../screen-header";
import { RangeTabs } from "../underline-tabs";
import { UserAvatar } from "../ui/avatar";
import { EmptyState } from "../ui/empty-state";
import { Pnl } from "../ui/pnl";
import { useSession } from "@/hooks/use-session";
import { signedBig } from "@/lib/format";
import { api } from "@/lib/http";

export function LeaderboardScreen() {
  const [win, setWin] = useState<PnlWindow>("d1");
  const { address } = useSession();
  const board = useQuery({ queryKey: ["leaderboard", win], queryFn: () => api.leaderboard(win) });
  const rows = board.data ?? [];
  const mine = address ? rows.find((r) => r.user.address.toLowerCase() === address.toLowerCase()) : undefined;

  return (
    <>
      <ScreenHeader title="Leaderboard" />
      {mine && (
        <div className="mx-4 mt-1 mb-2 flex items-center gap-3 rounded-[16px] bg-surface p-4 lg:mx-6">
          <UserAvatar user={mine.user} size={48} />
          <div className="flex-1">
            <p className="text-[14px] leading-5 text-muted">Your rank</p>
            <p className="mt-0.5 inline-block rounded-[8px] bg-accent-soft px-2 text-[20px] leading-7 font-medium text-text tabular-nums">
              <span className="text-accent-hi">#</span>
              {mine.rank}
            </p>
          </div>
          <Pnl value={signedBig(mine.pnlMusd)} className="text-[20px] leading-[26px] font-medium" />
        </div>
      )}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 lg:px-6">
        <h2 className="text-[19px] leading-6 font-medium tracking-[-0.01em]">Top traders</h2>
        <RangeTabs
          value={win}
          onChange={setWin}
          options={[
            { value: "d1", label: "24h" },
            { value: "d7", label: "7d" },
            { value: "all", label: "All time" },
          ]}
        />
      </div>
      {board.isPending ? (
        <RowSkeletons />
      ) : board.isError ? (
        <EmptyState title="Can't reach the musdy server" body="Rankings show up once it's back." />
      ) : rows.length === 0 ? (
        <EmptyState title="No one is ranked yet" body="Traders show up here by PnL once they buy and sell." />
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.user.address}>
              <LeaderRow row={r} self={r === mine} />
            </li>
          ))}
        </ul>
      )}
      <FeedRail traders={false} />
    </>
  );
}

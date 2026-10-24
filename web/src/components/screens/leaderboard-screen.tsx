"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RowSkeletons } from "../feed-list";
import { LeaderRow } from "../leader-row";
import { ScreenHeader } from "../screen-header";
import { EmptyState } from "../ui/empty-state";
import { Segmented } from "../ui/segmented";
import { useSession } from "@/hooks/use-session";
import { api, type PnlWindow } from "@/lib/http";

export function LeaderboardScreen() {
  const [win, setWin] = useState<PnlWindow>("d1");
  const { address } = useSession();
  const board = useQuery({ queryKey: ["leaderboard", win], queryFn: () => api.leaderboard(win) });
  const rows = board.data ?? [];
  const mine = address ? rows.find((r) => r.user.address.toLowerCase() === address.toLowerCase()) : undefined;

  return (
    <>
      <ScreenHeader title="Leaderboard" />
      <div className="px-4 pb-2">
        <Segmented
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
      {mine && mine.rank > 8 && (
        <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-10 border-t border-line">
          <LeaderRow row={mine} self />
        </div>
      )}
    </>
  );
}

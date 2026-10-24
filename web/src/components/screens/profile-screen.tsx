"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { BackBar } from "../back-bar";
import { FeedList } from "../feed-list";
import { HandleSheet } from "../handle-sheet";
import { LoginGate } from "../login-gate";
import { PositionRow } from "../position-row";
import { ScreenHeader } from "../screen-header";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Pnl } from "../ui/pnl";
import { Segmented } from "../ui/segmented";
import { Skeleton } from "../ui/skeleton";
import { useActions } from "@/hooks/use-actions";
import { useTradeList } from "@/hooks/use-feed";
import { useProfile } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { displayName, shortAddr, signedBig } from "@/lib/format";
import type { PnlWindow } from "shared";
import { api } from "@/lib/http";

export function OwnProfileScreen() {
  const { address } = useSession();
  return (
    <>
      <ScreenHeader title="Profile" />
      <LoginGate title="Make a name for yourself" body="Log in to pick a handle, follow traders and show your PnL.">
        {address && <ProfileView address={address} />}
      </LoginGate>
    </>
  );
}

export function UserProfileScreen() {
  const params = useParams<{ address: string }>();
  const raw = params.address ?? "";
  if (!isAddress(raw)) {
    return (
      <>
        <BackBar title="" />
        <EmptyState title="That isn't an address" />
      </>
    );
  }
  return <UserProfile address={raw} />;
}

// someone else's profile is a drill in, so it gets a back chevron and their name
function UserProfile({ address }: { address: Address }) {
  const p = useProfile(address).data;
  return (
    <>
      <BackBar title={p ? displayName(p.user) : shortAddr(address)} />
      <ProfileView address={address} />
    </>
  );
}

const WINDOWS: { value: PnlWindow; label: string }[] = [
  { value: "d1", label: "24h" },
  { value: "d7", label: "7d" },
  { value: "all", label: "All" },
];

function ProfileView({ address }: { address: Address }) {
  const { address: me, logout } = useSession();
  const self = !!me && me.toLowerCase() === address.toLowerCase();
  const profile = useProfile(address);
  const actions = useActions();
  const [win, setWin] = useState<PnlWindow>("all");
  const [tab, setTab] = useState<"positions" | "trades">("positions");
  const [editing, setEditing] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const trades = useTradeList(`user:${address.toLowerCase()}`, ["userTrades", address.toLowerCase()], () => api.userTrades(address));
  const p = profile.data;
  const isFollowing = following ?? p?.followedByViewer ?? false;
  const user = p?.user ?? { address, handle: null, avatar: null };
  const positions = (p?.positions ?? []).filter((x) => BigInt(x.amount) > 0n);

  const toggleFollow = async () => {
    const next = !isFollowing;
    setBusy(true);
    const ok = await actions.follow(address, next);
    setBusy(false);
    if (ok) setFollowing(next);
  };

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3 px-4 pt-2 pb-6">
        <div className="flex items-center gap-4">
          <Avatar user={user} size={72} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[20px] leading-[26px] font-semibold" data-testid="profile-name">
              {user.handle ?? shortAddr(address)}
            </p>
            <p className="truncate font-mono text-[12px] leading-4 text-muted">{user.handle ? `@${user.handle}` : address}</p>
            {p ? (
              <p className="mt-1.5 flex gap-3 text-[13px] text-muted">
                <span>
                  <b className="font-semibold text-text">{p.followers}</b> followers
                </span>
                <span>
                  <b className="font-semibold text-text">{p.following}</b> following
                </span>
                <span>
                  <b className="font-semibold text-text">{p.trades}</b> trades
                </span>
              </p>
            ) : profile.isPending ? (
              <Skeleton className="mt-2 h-3.5 w-40" />
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="label">PnL</p>
            {p ? (
              <Pnl value={signedBig(p.pnl[win])} className="mt-1 block text-[40px] leading-[44px] font-bold tracking-[-0.03em]" />
            ) : profile.isError ? (
              <p className="mt-1 text-[14px] text-muted">Can&apos;t load this profile right now.</p>
            ) : (
              <Skeleton className="mt-2 h-10 w-40" />
            )}
          </div>
          <div className="w-[168px]">
            <Segmented size="sm" value={win} onChange={setWin} options={WINDOWS} />
          </div>
        </div>

        {self ? (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Button variant="raised" onClick={() => setEditing(true)} data-testid="edit-handle">
              {user.handle ? "Edit handle" : "Set a handle"}
            </Button>
            <Link href="/leaderboard" className="press inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-raised text-[15px] font-semibold">
              <Icon name="trophy" size={20} /> Leaderboard
            </Link>
          </div>
        ) : (
          me &&
          (!p ? (
            <Skeleton className="mt-2 h-[52px] w-full rounded-[14px]" />
          ) : (
            <Button
              variant={isFollowing ? "raised" : "accent"}
              className="mt-2 h-[52px] w-full"
              disabled={busy}
              onClick={toggleFollow}
              data-testid="follow"
            >
              {isFollowing ? "Following" : "Follow"}
            </Button>
          ))
        )}
      </section>

      <div className="px-4 pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "positions", label: "Positions" },
            { value: "trades", label: "Trades" },
          ]}
        />
      </div>
      {tab === "positions" ? (
        profile.isPending ? (
          <Skeleton className="mx-4 mt-3 h-16" />
        ) : positions.length === 0 ? (
          <EmptyState title="No positions" body={self ? "What you buy shows up here." : "Nothing held right now."} />
        ) : (
          <ul>
            {positions.map((x) => (
              <li key={x.token.address}>
                <PositionRow position={x} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <FeedList items={trades.items} live={trades.live} loading={trades.loading} error={trades.error} empty={<EmptyState title="No trades yet" />} />
      )}

      {self && (
        <button onClick={logout} className="press mx-auto my-6 h-11 min-w-[120px] rounded-full px-4 text-[14px] font-medium text-muted" data-testid="logout">
          Log out
        </button>
      )}
      {self && <HandleSheet open={editing} onOpenChange={setEditing} current={user.handle} />}
    </div>
  );
}

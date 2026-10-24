"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { BackBar } from "../back-bar";
import { FeedList } from "../feed-list";
import { FeedRail } from "../feed-rail";
import { HandleSheet } from "../handle-sheet";
import { LoginGate } from "../login-gate";
import { PositionRow } from "../position-row";
import { ScreenHeader } from "../screen-header";
import { UserAvatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ArrowsLeftRightIcon, PencilSimpleIcon, TrophyIcon } from "@phosphor-icons/react";
import { Pnl } from "../ui/pnl";
import { RangeTabs, UnderlineTabs } from "../underline-tabs";
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
      <section className="flex flex-col px-4 pt-2 pb-5 lg:px-6">
        <div className="relative w-fit">
          <UserAvatar user={user} size={72} />
          {self && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit handle"
              className="absolute -right-1 -bottom-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full border-2 border-bg bg-black text-white"
            >
              <PencilSimpleIcon size={14} weight="fill" />
            </button>
          )}
        </div>
        <p className="mt-3 truncate text-[24px] leading-[30px] font-medium tracking-[-0.01em]" data-testid="profile-name">
          {user.handle ?? shortAddr(address)}
        </p>
        <p className="truncate text-[15px] leading-5 text-muted">{user.handle ? `@${user.handle}` : address}</p>
        {p ? (
          <>
            <p className="mt-3 flex gap-5 text-[15px] leading-5 text-muted">
              <span>
                <b className="font-semibold text-text tabular-nums">{p.following}</b> Following
              </span>
              <span>
                <b className="font-semibold text-text tabular-nums">{p.followers}</b> Followers
              </span>
            </p>
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] leading-[17px] text-muted">
              <ArrowsLeftRightIcon size={14} weight="fill" />
              {p.trades} trades
            </p>
          </>
        ) : profile.isPending ? (
          <Skeleton className="mt-3 h-4 w-48" />
        ) : null}

        {self ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setEditing(true)} data-testid="edit-handle">
              {user.handle ? "Edit handle" : "Set a handle"}
            </Button>
            <Button variant="secondary" render={<Link href="/leaderboard" />}>
              <TrophyIcon weight="bold" /> Leaderboard
            </Button>
          </div>
        ) : (
          me &&
          (!p ? (
            <Skeleton className="mt-5 h-12 w-full rounded-[14px]" />
          ) : (
            <Button
              variant={isFollowing ? "secondary" : "primary"}
              size="md"
              className="mt-5 w-full"
              disabled={busy}
              onClick={toggleFollow}
              data-testid="follow"
            >
              {isFollowing ? "Following" : "Follow"}
            </Button>
          ))
        )}
      </section>

      <section className="border-t border-border px-4 pt-5 pb-4 lg:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] leading-[17px] text-muted">PnL</p>
            {p ? (
              <Pnl value={signedBig(p.pnl[win])} className="mt-1 block text-[40px] leading-[44px] font-medium tracking-[-0.03em]" />
            ) : profile.isError ? (
              <p className="mt-1 text-[14px] text-muted">Can&apos;t load this profile right now.</p>
            ) : (
              <Skeleton className="mt-2 h-10 w-40" />
            )}
          </div>
          <RangeTabs value={win} onChange={setWin} options={WINDOWS} />
        </div>
      </section>

      <UnderlineTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "positions", label: p ? `Positions (${positions.length})` : "Positions" },
          { value: "trades", label: "Trades" },
        ]}
      />
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
        <Button variant="ghost" size="sm" onClick={logout} className="mx-auto my-8 px-5" data-testid="logout">
          Log out
        </Button>
      )}
      <FeedRail />
      {self && <HandleSheet open={editing} onOpenChange={setEditing} current={user.handle} />}
    </div>
  );
}

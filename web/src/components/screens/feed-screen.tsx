"use client";
import Link from "next/link";
import { useState } from "react";
import { topicKey, type FeedScope } from "shared";
import { FeedList } from "../feed-list";
import { LoginOptions } from "../login-sheet";
import { ScreenHeader } from "../screen-header";
import { EmptyState } from "../ui/empty-state";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Segmented } from "../ui/segmented";
import { useTradeList } from "@/hooks/use-feed";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/http";
import { openSheet } from "@/lib/ui";

export function FeedScreen() {
  const [scope, setScope] = useState<FeedScope>("global");
  const { address, ready } = useSession();
  const following = scope === "following";
  const topic = following ? (address ? topicKey(`feed:following:${address}`) : null) : topicKey("feed:global");
  const feed = useTradeList(
    topic,
    ["feed", scope, address?.toLowerCase() ?? null],
    following ? (address ? () => api.feed("following", address) : null) : () => api.feed("global"),
  );

  return (
    <>
      <ScreenHeader
        title="Feed"
        extra={
          <Link href="/leaderboard" aria-label="Leaderboard" className="press grid h-11 w-11 place-items-center text-muted">
            <Icon name="trophy" />
          </Link>
        }
      />
      {ready && !address && !following && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[20px] bg-surface py-2 pr-2 pl-4" data-testid="feed-intro">
          <p className="flex-1 text-[14px] leading-5">Copy real traders in one tap. One USD balance, no gas.</p>
          <Button variant="accent" className="h-11 shrink-0 px-4" onClick={() => openSheet("login")}>
            Log in
          </Button>
        </div>
      )}
      <div className="px-4 pb-2">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "global", label: "Global" },
            { value: "following", label: "Following" },
          ]}
        />
      </div>
      {following && ready && !address ? (
        <EmptyState title="Log in to see who you follow" body="Follow traders from their profile and their buys land here." action={<div className="w-[300px]"><LoginOptions /></div>} />
      ) : (
        <FeedList
          key={scope}
          items={feed.items}
          live={feed.live}
          loading={feed.loading}
          error={feed.error}
          empty={
            following ? (
              <EmptyState title="Your following feed is empty" body="Follow traders from their profile or the leaderboard and their trades show up here." />
            ) : (
              <EmptyState title="No trades yet" body="Every buy and sell on musdy shows up here live. Be the first." />
            )
          }
        />
      )}
    </>
  );
}

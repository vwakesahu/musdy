"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { topicKey, type FeedScope } from "shared";
import { FunnelSimpleIcon, TrophyIcon } from "@phosphor-icons/react";
import { FeedList } from "../feed-list";
import { FeedRail } from "../feed-rail";
import { LoginOptions } from "../login-sheet";
import { ScreenHeader } from "../screen-header";
import { UnderlineTabs } from "../underline-tabs";
import { EmptyState } from "../ui/empty-state";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { useTradeList } from "@/hooks/use-feed";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/http";
import { cn } from "@/lib/utils";

type Side = "all" | "buy" | "sell";

function SideFilter({ value, onChange }: { value: Side; onChange: (v: Side) => void }) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Filter trades"
        className={cn(
          "press grid h-10 w-10 cursor-pointer place-items-center rounded-[10px] transition-colors hover:bg-surface-3",
          value === "all" ? "text-muted" : "text-accent-hi",
        )}
      >
        <FunnelSimpleIcon size={22} weight="bold" />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-40">
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as Side)}>
          <MenuRadioItem value="all">All trades</MenuRadioItem>
          <MenuRadioItem value="buy">Buys only</MenuRadioItem>
          <MenuRadioItem value="sell">Sells only</MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

export function FeedScreen() {
  const [scope, setScope] = useState<FeedScope>("global");
  const [side, setSide] = useState<Side>("all");
  const { address, ready } = useSession();
  const reduced = useReducedMotion();
  const following = scope === "following";
  const topic = following ? (address ? topicKey(`feed:following:${address}`) : null) : topicKey("feed:global");
  const feed = useTradeList(
    topic,
    ["feed", scope, address?.toLowerCase() ?? null],
    following ? (address ? () => api.feed("following", address) : null) : () => api.feed("global"),
  );
  const items = useMemo(() => (side === "all" ? feed.items : feed.items.filter((x) => x.isBuy === (side === "buy"))), [feed.items, side]);

  return (
    <>
      <ScreenHeader
        title="Feed"
        extra={
          <Link href="/leaderboard" aria-label="Leaderboard" className="press grid h-10 w-10 place-items-center rounded-[10px] text-text hover:bg-surface-3 lg:hidden">
            <TrophyIcon size={22} weight="bold" />
          </Link>
        }
      />
      {ready && !address && !following && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[14px] bg-surface px-4 py-3 lg:mx-6" data-testid="feed-intro">
          <p className="flex-1 text-[15px] leading-[21px] text-text-2">Copy real traders in one tap. One USD balance, no gas.</p>
        </div>
      )}
      <UnderlineTabs
        value={scope}
        onChange={setScope}
        options={[
          { value: "global", label: "Global" },
          { value: "following", label: "Following" },
        ]}
        right={<SideFilter value={side} onChange={setSide} />}
      />
      <motion.div key={scope} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        {following && ready && !address ? (
          <EmptyState title="Log in to see who you follow" body="Follow traders from their profile and their buys land here." action={<div className="w-[300px]"><LoginOptions /></div>} />
        ) : (
          <FeedList
            items={items}
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
      </motion.div>
      <FeedRail />
    </>
  );
}

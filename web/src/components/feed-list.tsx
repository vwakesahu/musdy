"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { FeedItem } from "shared";
import { useSession } from "@/hooks/use-session";
import { FeedRow } from "./feed-row";
import { EmptyState } from "./ui/empty-state";
import { Skeleton } from "./ui/skeleton";

export function RowSkeletons({ n = 6 }: { n?: number }) {
  return (
    <ul aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex min-h-[72px] items-center gap-3 border-b border-line px-4 py-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-48" />
          </span>
        </li>
      ))}
    </ul>
  );
}

const SCROLL_FREEZE = 120;

export function FeedList({
  items,
  live,
  loading,
  error,
  empty,
}: {
  items: FeedItem[];
  live: Set<string> | null;
  loading: boolean;
  error: Error | null;
  empty: ReactNode;
}) {
  const { address } = useSession();
  const reduced = useReducedMotion();
  const [frozenTop, setFrozenTop] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const down = window.scrollY > SCROLL_FREEZE;
      setFrozenTop((cur) => (down ? (cur ?? items[0]?.id ?? null) : null));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  const cut = frozenTop ? items.findIndex((x) => x.id === frozenTop) : 0;
  const hidden = cut > 0 ? cut : 0;
  const visible = hidden ? items.slice(hidden) : items;

  if (loading) return <RowSkeletons />;
  if (items.length === 0) {
    if (error) return <EmptyState title="Can't reach the musdy server" body="The feed fills in on its own once it's back." />;
    return <>{empty}</>;
  }

  return (
    <>
      {hidden > 0 && (
        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
            setFrozenTop(null);
          }}
          className="press fixed top-16 left-1/2 z-30 -translate-x-1/2 rounded-full bg-raised px-4 py-2 text-[13px] font-semibold shadow-lg shadow-black/50"
        >
          {hidden} new
        </button>
      )}
      <ul>
        <AnimatePresence initial={false}>
          {visible.map((item) => (
            <motion.li
              key={item.id}
              layout={reduced ? false : "position"}
              initial={live?.has(item.id) ? { opacity: 0, y: reduced ? 0 : -24 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.24, ease: [0.65, 0, 0.35, 1] } }}
            >
              <FeedRow item={item} self={!!address && item.user.address.toLowerCase() === address.toLowerCase()} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

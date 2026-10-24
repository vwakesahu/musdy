"use client";
import { useSocketStatus } from "@/hooks/use-socket-status";

export function SocketBanner() {
  const status = useSocketStatus();
  if (status !== "closed") return null;
  return (
    <div role="status" className="mx-4 mb-2 rounded-full bg-surface px-3 py-1.5 text-center text-[12px] leading-4 font-medium text-muted">
      Live updates paused, reconnecting
    </div>
  );
}

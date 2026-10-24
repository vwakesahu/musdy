"use client";
import { useSession } from "@/hooks/use-session";
import { useSocketStatus } from "@/hooks/use-socket-status";

export function SocketBanner() {
  const status = useSocketStatus();
  const { configError } = useSession();
  return (
    <>
      {configError && (
        <div role="alert" data-testid="config-error" className="mx-4 mb-2 flex items-start gap-2 rounded-[14px] bg-surface px-3 py-2 text-[13px] leading-5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-down" aria-hidden />
          <span>{configError}</span>
        </div>
      )}
      {status === "closed" && (
        <div role="status" className="mx-4 mb-2 rounded-full bg-surface px-3 py-1.5 text-center text-[12px] leading-4 font-medium text-muted">
          Live updates paused, reconnecting
        </div>
      )}
    </>
  );
}

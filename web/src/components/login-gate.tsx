"use client";
import type { ReactNode } from "react";
import { useSession } from "@/hooks/use-session";
import { LoginOptions } from "./login-sheet";
import { RowSkeletons } from "./feed-list";

export function LoginGate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { ready, address } = useSession();
  if (!ready) return <RowSkeletons n={3} />;
  if (address) return <>{children}</>;
  return (
    <div className="flex flex-col gap-2 px-4 py-10">
      <p className="text-[20px] leading-[26px] font-semibold">{title}</p>
      <p className="mb-4 text-[14px] leading-5 text-muted">{body}</p>
      <LoginOptions />
    </div>
  );
}

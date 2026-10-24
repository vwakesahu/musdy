"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { useSession } from "@/hooks/use-session";
import { LoginOptions } from "./login-sheet";
import { RowSkeletons } from "./feed-list";

export function LoginGate({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { ready, address } = useSession();
  if (!ready) return <RowSkeletons n={3} />;
  if (address) return <>{children}</>;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <Image src="/brand/mark.svg" alt="" width={64} height={64} className="mb-6 size-16" />
      <p className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{title}</p>
      <p className="mt-2 mb-8 max-w-[340px] text-[15px] leading-[21px] text-muted">{body}</p>
      <div className="w-full max-w-[360px] text-left">
        <LoginOptions />
      </div>
    </div>
  );
}

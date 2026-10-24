import type { ReactNode } from "react";
import { HeaderAccount } from "./header-account";
import { HeaderBalance } from "./header-balance";
import { SocketBanner } from "./socket-banner";

export function ScreenHeader({ title, left, right, extra }: { title: string; left?: ReactNode; right?: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-[52px] items-center gap-2 bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-[16px] lg:h-16 lg:px-6">
        {left}
        <h1 className="flex-1 truncate text-[20px] leading-[26px] font-semibold tracking-[-0.02em] lg:text-[24px]">{title}</h1>
        {extra}
        {right ?? <HeaderBalance />}
        <HeaderAccount />
      </header>
      <SocketBanner />
    </>
  );
}

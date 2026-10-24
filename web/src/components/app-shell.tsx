"use client";
import { useState, type ReactNode } from "react";
import { NavRail } from "./nav-rail";
import { RightRailSlot } from "./right-rail";
import { TabBar } from "./tab-bar";

export function AppShell({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <RightRailSlot.Provider value={slot}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[72px_minmax(0,1fr)_360px] xl:grid-cols-[240px_minmax(0,1fr)_360px]">
        <NavRail />
        <main className="mx-auto flex min-h-dvh w-full max-w-[720px] min-w-0 flex-col pb-[calc(56px+env(safe-area-inset-bottom))] lg:border-x lg:border-border lg:pb-8">{children}</main>
        <aside ref={setSlot} aria-label="Sidebar" className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto px-6 py-5 lg:flex" />
        <TabBar />
      </div>
    </RightRailSlot.Provider>
  );
}

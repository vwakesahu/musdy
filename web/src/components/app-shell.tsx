import type { ReactNode } from "react";
import { TabBar } from "./tab-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-bg pb-[calc(56px+env(safe-area-inset-bottom))] md:border-x md:border-line">
      {children}
      <TabBar />
    </div>
  );
}

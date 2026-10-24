"use client";
import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { chain, wagmiConfig } from "@/lib/chain";
import { env } from "@/lib/env";
import { PrivySession } from "./privy-session";
import { SessionRoot } from "./session-root";
import { LiveBridge } from "./live-bridge";
import { Toaster } from "./toaster";
import { GlobalSheets } from "./global-sheets";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } }),
  );

  const app = (
    <>
      <LiveBridge />
      {children}
      <GlobalSheets />
      <Toaster />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {env.privyAppId ? (
          <PrivyProvider
            appId={env.privyAppId}
            config={{
              loginMethods: ["google"],
              appearance: { theme: "dark", accentColor: "#F7931A", showWalletLoginFirst: false },
              embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
              supportedChains: [chain],
              defaultChain: chain,
            }}
          >
            <PrivySession>{app}</PrivySession>
          </PrivyProvider>
        ) : (
          <SessionRoot privy={null}>{app}</SessionRoot>
        )}
      </WagmiProvider>
    </QueryClientProvider>
  );
}

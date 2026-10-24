"use client";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { devPrivateKey } from "@/lib/env";
import type { Signer } from "@/lib/signer";
import { createStore } from "@/lib/store";
import { SessionContext, type Session } from "@/hooks/use-session";

export type PrivyState = {
  ready: boolean;
  authenticated: boolean;
  signer: Signer | null;
  login: () => void;
  logout: () => void;
};

const DEV_FLAG = "musdy:dev";
const devStore = createStore<boolean | null>(null);
const readDev = () => {
  if (devStore.get() === null) {
    try {
      devStore.set(window.localStorage.getItem(DEV_FLAG) === "1");
    } catch {
      devStore.set(false);
    }
  }
  return devStore.get() ?? false;
};
const writeDev = (on: boolean) => {
  try {
    if (on) window.localStorage.setItem(DEV_FLAG, "1");
    else window.localStorage.removeItem(DEV_FLAG);
  } catch {}
  devStore.set(on);
};

const devAccount = devPrivateKey ? privateKeyToAccount(devPrivateKey) : null;
const devSigner: Signer | null = devAccount
  ? {
      address: devAccount.address,
      signTypedData: (data) => devAccount.signTypedData(data),
      signMessage: (message) => devAccount.signMessage({ message }),
    }
  : null;

export function SessionRoot({ privy, children }: { privy: PrivyState | null; children: ReactNode }) {
  const devOn = useSyncExternalStore(devStore.subscribe, readDev, () => false);
  const hydrated = useSyncExternalStore(
    devStore.subscribe,
    () => true,
    () => false,
  );

  const loginDev = useCallback(() => writeDev(true), []);
  const loginPrivy = useCallback(() => privy?.login(), [privy]);
  const logout = useCallback(() => {
    writeDev(false);
    privy?.logout();
  }, [privy]);

  const value = useMemo<Session>(() => {
    const dev = devOn && devSigner ? devSigner : null;
    const signer = dev ?? (privy?.authenticated ? privy.signer : null);
    return {
      ready: hydrated && (dev !== null || !privy || privy.ready),
      address: signer?.address ?? null,
      signer,
      method: dev ? "dev" : signer ? "privy" : null,
      canPrivy: privy !== null,
      canDev: devSigner !== null,
      loginPrivy,
      loginDev,
      logout,
    };
  }, [devOn, hydrated, privy, loginDev, loginPrivy, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

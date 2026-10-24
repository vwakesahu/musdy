"use client";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { chainMismatch, devKeyState, devPrivateKey, signingAllowed } from "@/lib/env";
import type { Signer } from "@/lib/signer";
import { socketChain } from "@/lib/socket";
import { createStore, useStore } from "@/lib/store";
import { useDeployment } from "@/hooks/use-deployment";
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

  const deployment = useDeployment();
  const config = deployment.data?.chainId ?? null;
  const socket = useStore(socketChain, (c) => c, null);
  const configError = chainMismatch({ config, socket });
  const allowed = signingAllowed({ config, socket });
  const devKey = devPrivateKey({ config, socket });

  // no signer of any kind exists until the server's chain matches the build
  const devSigner = useMemo<Signer | null>(() => {
    if (!devKey) return null;
    const account = privateKeyToAccount(devKey);
    return {
      address: account.address,
      signTypedData: (data) => account.signTypedData(data),
      signMessage: (message) => account.signMessage({ message }),
    };
  }, [devKey]);

  const value = useMemo<Session>(() => {
    const dev = devOn && devSigner ? devSigner : null;
    const signer = dev ?? (allowed && privy?.authenticated ? privy.signer : null);
    return {
      // a remembered dev login waits for the chain check instead of flashing the login screen
      ready: hydrated && (devOn && devKeyState === "ok" && !dev && !configError && !deployment.isError ? false : dev !== null || !privy || privy.ready),
      configError,
      address: signer?.address ?? null,
      signer,
      method: dev ? "dev" : signer ? "privy" : null,
      canPrivy: privy !== null,
      canDev: devSigner !== null,
      loginPrivy,
      loginDev,
      logout,
    };
  }, [devOn, devSigner, allowed, configError, deployment.isError, hydrated, privy, loginDev, loginPrivy, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

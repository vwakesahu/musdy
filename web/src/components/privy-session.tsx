"use client";
import { useCallback, useMemo, type ReactNode } from "react";
import { useLoginWithOAuth, usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { chain } from "@/lib/chain";
import type { Signer } from "@/lib/signer";
import { errorText, toast } from "@/lib/toast";
import { SessionRoot, type PrivyState } from "./session-root";

const oauthFailed = (e: unknown) => toast("error", `Google login didn't finish. ${errorText(e)}`);

export function PrivySession({ children }: { children: ReactNode }) {
  const { ready, authenticated, logout } = usePrivy();
  const { initOAuth, state: oauth } = useLoginWithOAuth({ onError: (code) => oauthFailed(code) });
  const { wallets } = useWallets();
  const embedded = wallets.find((w) => w.walletClientType === "privy");

  const signer = useMemo<Signer | null>(() => {
    if (!embedded) return null;
    const address = embedded.address as Address;
    const client = async () =>
      createWalletClient({ account: address, chain, transport: custom(await embedded.getEthereumProvider()) });
    return {
      address,
      signTypedData: async (data) => (await client()).signTypedData({ ...data, account: address }),
      signMessage: async (message) => (await client()).signMessage({ account: address, message }),
    };
  }, [embedded]);

  const login = useCallback(() => {
    initOAuth({ provider: "google" }).catch(oauthFailed);
  }, [initOAuth]);

  const busy = oauth.status === "loading" || (authenticated && !signer);

  const state = useMemo<PrivyState>(
    () => ({ ready, authenticated, busy, signer, login, logout: () => void logout() }),
    [ready, authenticated, busy, signer, login, logout],
  );

  return <SessionRoot privy={state}>{children}</SessionRoot>;
}

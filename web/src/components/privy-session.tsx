"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getEmbeddedConnectedWallet,
  useCreateWallet,
  useLoginWithOAuth,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { chain } from "@/lib/chain";
import type { Signer } from "@/lib/signer";
import { errorText, toast } from "@/lib/toast";
import { SessionRoot, type PrivyState } from "./session-root";

const oauthFailed = (e: unknown) =>
  toast("error", `Google login didn't finish. ${errorText(e)}`);

export function PrivySession({ children }: { children: ReactNode }) {
  const { ready, authenticated, logout } = usePrivy();
  const { initOAuth, state: oauth } = useLoginWithOAuth({
    onError: (code) => oauthFailed(code),
  });
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const embedded = getEmbeddedConnectedWallet(wallets);
  const [walletError, setWalletError] = useState(false);
  const creating = useRef(false);

  // headless oauth doesn't always run createOnLogin, so a logged in user without a wallet gets one here
  useEffect(() => {
    if (
      !ready ||
      !authenticated ||
      !walletsReady ||
      embedded ||
      creating.current
    )
      return;
    creating.current = true;
    createWallet()
      .catch((e: unknown) => {
        if (/already has/i.test(errorText(e))) return;
        setWalletError(true);
        toast("error", `Couldn't set up your wallet. ${errorText(e)}`);
      })
      .finally(() => {
        creating.current = false;
      });
  }, [ready, authenticated, walletsReady, embedded, createWallet]);

  const signer = useMemo<Signer | null>(() => {
    if (!embedded) return null;
    const address = embedded.address as Address;
    const client = async () =>
      createWalletClient({
        account: address,
        chain,
        transport: custom(await embedded.getEthereumProvider()),
      });
    return {
      address,
      signTypedData: async (data) =>
        (await client()).signTypedData({ ...data, account: address }),
      signMessage: async (message) =>
        (await client()).signMessage({ account: address, message }),
    };
  }, [embedded]);

  const login = useCallback(() => {
    initOAuth({ provider: "google" }).catch(oauthFailed);
  }, [initOAuth]);

  const busy =
    !walletError && (oauth.status === "loading" || (authenticated && !signer));

  const state = useMemo<PrivyState>(
    () => ({
      ready,
      authenticated,
      busy,
      signer,
      login,
      logout: () => {
        setWalletError(false);
        void logout();
      },
    }),
    [ready, authenticated, busy, signer, login, logout],
  );

  return <SessionRoot privy={state}>{children}</SessionRoot>;
}

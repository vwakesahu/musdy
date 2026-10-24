"use client";
import { useMemo, type ReactNode } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type Address } from "viem";
import { chain } from "@/lib/chain";
import type { Signer } from "@/lib/signer";
import { SessionRoot, type PrivyState } from "./session-root";

export function PrivySession({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
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

  const state = useMemo<PrivyState>(
    () => ({ ready, authenticated, signer, login: () => login(), logout: () => void logout() }),
    [ready, authenticated, signer, login, logout],
  );

  return <SessionRoot privy={state}>{children}</SessionRoot>;
}

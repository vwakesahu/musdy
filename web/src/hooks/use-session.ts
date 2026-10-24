"use client";
import { createContext, useContext } from "react";
import type { Address } from "viem";
import type { Signer } from "@/lib/signer";

export type Session = {
  ready: boolean;
  configError: string | null;
  address: Address | null;
  signer: Signer | null;
  method: "privy" | "dev" | null;
  canPrivy: boolean;
  loginBusy: boolean;
  canDev: boolean;
  loginPrivy: () => void;
  loginDev: () => void;
  logout: () => void;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionRoot");
  return s;
}

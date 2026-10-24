"use client";
import { useCallback } from "react";
import { useStore } from "@/lib/store";
import { sheet } from "@/lib/ui";
import { DepositSheet } from "./deposit-sheet";
import { LoginSheet } from "./login-sheet";
import { WithdrawSheet } from "./withdraw-sheet";

export function GlobalSheets() {
  const open = useStore(sheet, (s) => s, null);
  const close = useCallback((o: boolean) => {
    if (!o) sheet.set(null);
  }, []);
  return (
    <>
      <LoginSheet open={open === "login"} onOpenChange={close} />
      <DepositSheet open={open === "deposit"} onOpenChange={close} />
      <WithdrawSheet open={open === "withdraw"} onOpenChange={close} />
    </>
  );
}

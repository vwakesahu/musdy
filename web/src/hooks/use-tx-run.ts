"use client";
import { useCallback, useState } from "react";
import type { TxStatus } from "shared";
import type { MorphState } from "@/components/ui/morph-button";
import { useTx } from "./use-live";

export function useTxRun() {
  const [signing, setSigning] = useState(false);
  const [txId, setTxId] = useState<string | null>(null);
  const tx = useTx(txId);
  const run = useCallback(async (fn: () => Promise<TxStatus | null>) => {
    setSigning(true);
    setTxId(null);
    const res = await fn();
    setSigning(false);
    setTxId(res?.id ?? null);
    return res;
  }, []);
  const reset = useCallback(() => setTxId(null), []);
  const status = tx?.status ?? null;
  const accepted = txId !== null && status !== "failed";
  const morph: MorphState = signing ? "pending" : accepted ? "success" : "idle";
  return { run, reset, txId, tx, signing, accepted, morph, confirmed: status === "confirmed", failed: status === "failed" };
}

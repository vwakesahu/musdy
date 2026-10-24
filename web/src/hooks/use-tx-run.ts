"use client";
import { useCallback, useState } from "react";
import type { TxStatus } from "shared";
import { useTx } from "./use-live";

// runs a signed action and follows the tx it answers with until the socket says it landed
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
  const status = tx?.status ?? null;
  return { run, txId, sending: signing || status === "pending", confirmed: status === "confirmed", failed: status === "failed" };
}

"use client";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { followMessage, profileMessage, type FeedItem, type TxStatus } from "shared";
import { api } from "@/lib/http";
import { liveTxs } from "@/lib/live";
import { signLaunch, signTrade, signWithdraw, type TradeInput } from "@/lib/sign";
import type { Signer } from "@/lib/signer";
import { errorText, toast } from "@/lib/toast";
import { openSheet } from "@/lib/ui";
import { useDeployment } from "./use-deployment";
import { useSession } from "./use-session";

const SLIPPAGE_BPS = 200n;
export const withSlippage = (amountOut: bigint) => (amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;

// every chain action: sign silently, post to the server, track the tx it answers with
export function useActions() {
  const { signer } = useSession();
  const dep = useDeployment().data;
  const qc = useQueryClient();

  return useMemo(() => {
    async function run<T>(fn: (s: Signer) => Promise<T>, onError?: (e: unknown) => void): Promise<T | null> {
      if (!signer) {
        openSheet("login");
        return null;
      }
      try {
        return await fn(signer);
      } catch (e) {
        toast("error", errorText(e));
        onError?.(e);
        return null;
      }
    }
    const needDep = () => {
      if (!dep) throw new Error("Server config isn't loaded yet");
      return dep;
    };
    const track = (tx: TxStatus) => {
      liveTxs.set((t) => ({ ...t, [tx.id]: t[tx.id] ?? tx }));
      return tx;
    };

    return {
      trade: (t: TradeInput) => run(async (s) => track(await api.trade(await signTrade(s, needDep(), t)))),
      copy: (item: FeedItem, cash: bigint) =>
        run(async (s) => {
          const want = BigInt(item.musdAmount);
          const amountIn = want < cash ? want : cash;
          if (amountIn <= 0n) throw new Error("No cash to copy with. Add MUSD first");
          const q = await api.quote(item.token.address, true, amountIn);
          const tx = await api.trade(
            await signTrade(s, needDep(), {
              token: item.token.address,
              isBuy: true,
              amountIn,
              minOut: withSlippage(BigInt(q.amountOut)),
              ref: item.user.address,
            }),
          );
          return track(tx);
        }),
      withdraw: (w: { token: Address; amount: bigint; to: Address }, onError?: (e: unknown) => void) =>
        run(async (s) => track(await api.withdraw(await signWithdraw(s, needDep(), w))), onError),
      launch: (l: { name: string; symbol: string; image: string; initialBuy: bigint }) =>
        run(async (s) => track(await api.launch(await signLaunch(s, needDep(), l)))),
      faucet: () => run(async (s) => track(await api.faucet({ address: s.address }))),
      setHandle: (handle: string) =>
        run(async (s) => {
          const issued = new Date().toISOString();
          const sig = await s.signMessage(profileMessage(handle, issued));
          const p = await api.profile({ address: s.address, handle, issued, sig });
          qc.setQueryData(["user", s.address.toLowerCase()], p);
          return p;
        }),
      follow: (target: Address, follow: boolean) =>
        run(async (s) => {
          const issued = new Date().toISOString();
          const sig = await s.signMessage(followMessage(target, follow, issued));
          await api.follow({ address: s.address, target, follow, issued, sig });
          void qc.invalidateQueries({ queryKey: ["user"] });
          return true;
        }),
    };
  }, [signer, dep, qc]);
}

"use client";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { faucetMessage, followMessage, profileMessage, type Deployment, type FeedItem, type Profile, type TokenRef, type TxStatus } from "shared";
import { logActivity, type ActivityKind } from "@/lib/activity";
import { mezoTx } from "@/lib/explorer";
import { ApiError, api } from "@/lib/http";
import { liveBalances, liveTxs, lk } from "@/lib/live";
import { addOp, type OptPos } from "@/lib/optimistic";
import { signIntent, signLaunch, signTrade, signWithdraw } from "@/lib/sign";
import type { Signer } from "@/lib/signer";
import { errorText, toast } from "@/lib/toast";
import { openSheet } from "@/lib/ui";
import { isMezo, keyOf } from "@/lib/xchain";
import { useDeployment } from "./use-deployment";
import { useSession } from "./use-session";

const SLIPPAGE_BPS = 200n;
export const withSlippage = (amountOut: bigint, extraBps = 0n) => (amountOut * (10_000n - SLIPPAGE_BPS - extraBps)) / 10_000n;

export type Order = { token: Pick<TokenRef, "chainId" | "address">; isBuy: boolean; amountIn: bigint; minOut: bigint; ref?: Address };
export const isSolverOff = (e: unknown) => e instanceof ApiError && e.code === "solver_off";

export type FeedDraft = Pick<FeedItem, "token" | "isBuy" | "musdAmount" | "tokenAmount" | "priceMusd" | "ref">;
export type Meta = {
  kind: ActivityKind;
  title: string;
  done: string;
  pending?: string;
  cashDelta?: bigint;
  pos?: Omit<OptPos, "base">;
  feed?: FeedDraft;
};
type OnError = (e: unknown) => boolean | void;

async function place(s: Signer, dep: Deployment, o: Order) {
  const { token, ...rest } = o;
  if (isMezo(token)) return api.trade(await signTrade(s, dep, { ...rest, token: token.address as Address }));
  return api.intent(await signIntent(s, dep, { ...rest, chainId: token.chainId, token: token.address }));
}

export function useActions() {
  const { signer } = useSession();
  const dep = useDeployment().data;
  const qc = useQueryClient();

  return useMemo(() => {
    const profileOf = (a: Address) => qc.getQueryData<Profile>(["user", a.toLowerCase(), a.toLowerCase()]);
    const serverCash = (a: Address) => {
      const live = dep ? liveBalances.get()?.vault[lk(dep.musd)] : undefined;
      if (live !== undefined) return live;
      const p = profileOf(a);
      return p ? BigInt(p.balanceMusd) : null;
    };
    const serverHeld = (a: Address, t: TokenRef) => {
      const p = profileOf(a)?.positions.find((x) => keyOf(x.token) === keyOf(t));
      return p ? BigInt(p.amount) : 0n;
    };

    async function run<T>(meta: Meta | null, fn: (s: Signer) => Promise<T>, onError?: OnError): Promise<T | null> {
      if (!signer) {
        openSheet("login");
        return null;
      }
      try {
        return await fn(signer);
      } catch (e) {
        if (onError?.(e) !== true) toast("error", errorText(e));
        if (meta) logActivity({ id: `err:${Date.now()}`, owner: signer.address, kind: meta.kind, title: meta.title, status: "failed", error: errorText(e) });
        return null;
      }
    }
    const needDep = () => {
      if (!dep) throw new Error("Server config isn't loaded yet");
      return dep;
    };

    // runs once the server accepted the signed action, before the chain confirms it
    const accept = (s: Signer, tx: TxStatus, meta: Meta) => {
      liveTxs.set((t) => ({ ...t, [tx.id]: t[tx.id] ?? tx }));
      const owner = s.address.toLowerCase();
      const known = liveTxs.get()[tx.id];
      if (known?.status === "failed") return tx;
      const user = profileOf(s.address)?.user ?? { address: s.address, handle: null, avatar: null };
      const feed: FeedItem | undefined = meta.feed && {
        ...meta.feed,
        id: `pending:${tx.id}`,
        block: Number.MAX_SAFE_INTEGER,
        ts: Math.floor(Date.now() / 1000),
        user,
        marketCapMusd: "0",
        venue: "pool",
        txHash: "0x",
      };
      if (known?.status !== "confirmed") {
        addOp({
          txId: tx.id,
          owner,
          cashDelta: meta.cashDelta ?? 0n,
          cashBase: serverCash(s.address),
          pos: meta.pos && { ...meta.pos, base: serverHeld(s.address, meta.pos.token) },
          feed,
        });
      }
      logActivity({ id: tx.id, txId: tx.id, owner, kind: meta.kind, title: meta.title, done: meta.done, status: known?.status ?? "pending", tx: mezoTx(known?.hash ?? tx.hash) });
      if (meta.pending && known?.status !== "confirmed") toast("pending", meta.pending, { key: tx.id, tx: mezoTx(tx.hash) });
      return tx;
    };

    const social = (s: Signer, kind: ActivityKind, title: string, done: string) => {
      logActivity({ id: `${kind}:${Date.now()}`, owner: s.address, kind, title, done, status: "confirmed" });
      toast("success", done);
    };

    return {
      trade: (o: Order, meta: Meta, onError?: OnError) => run(meta, async (s) => accept(s, await place(s, needDep(), o), meta), onError),
      copy: (item: FeedItem, cash: bigint, describe: (amountIn: bigint, amountOut: bigint) => Meta, onError?: OnError) =>
        run(null, async (s) => {
          if (!item.isBuy) throw new Error("Only buys can be copied");
          const want = BigInt(item.musdAmount);
          const amountIn = want < cash ? want : cash;
          if (amountIn <= 0n) throw new Error("No cash to copy with. Add MUSD first");
          const q = await api.quote(item.token, true, amountIn);
          const tx = await place(s, needDep(), { token: item.token, isBuy: true, amountIn, minOut: withSlippage(BigInt(q.amountOut)), ref: item.user.address });
          return accept(s, tx, describe(amountIn, BigInt(q.amountOut)));
        }, onError),
      withdraw: (w: { token: Address; amount: bigint; to: Address }, meta: Meta, onError?: OnError) =>
        run(meta, async (s) => accept(s, await api.withdraw(await signWithdraw(s, needDep(), w)), meta), onError),
      launch: (l: { name: string; symbol: string; image: string; initialBuy: bigint }, meta: Meta) =>
        run(meta, async (s) => accept(s, await api.launch(await signLaunch(s, needDep(), l)), meta)),
      faucet: (meta: Meta, onError?: OnError) =>
        run(meta, async (s) => {
          const issued = new Date().toISOString();
          const sig = await s.signMessage(faucetMessage(s.address, issued));
          return accept(s, await api.faucet({ address: s.address, issued, sig }), meta);
        }, onError),
      setHandle: (handle: string) =>
        run({ kind: "handle", title: `Set handle @${handle}`, done: "" }, async (s) => {
          const issued = new Date().toISOString();
          const sig = await s.signMessage(profileMessage(handle, issued));
          const p = await api.profile({ address: s.address, handle, issued, sig });
          qc.setQueryData(["user", s.address.toLowerCase(), s.address.toLowerCase()], p);
          void qc.invalidateQueries({ queryKey: ["user"] });
          social(s, "handle", `Set handle @${handle}`, `You're @${handle} now`);
          return p;
        }),
      follow: (target: Address, follow: boolean, name: string) =>
        run({ kind: "follow", title: `${follow ? "Follow" : "Unfollow"} ${name}`, done: "" }, async (s) => {
          const issued = new Date().toISOString();
          const sig = await s.signMessage(followMessage(target, follow, issued));
          await api.follow({ address: s.address, target, follow, issued, sig });
          void qc.invalidateQueries({ queryKey: ["user"] });
          social(s, "follow", `${follow ? "Follow" : "Unfollow"} ${name}`, follow ? `Following ${name}` : `Unfollowed ${name}`);
          return true;
        }),
    };
  }, [signer, dep, qc]);
}

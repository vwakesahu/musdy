"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { topicKey } from "shared";
import { useDeployment } from "@/hooks/use-deployment";
import { useSession } from "@/hooks/use-session";
import { useTopic } from "@/hooks/use-topic";
import { api } from "@/lib/http";
import { liveBalances, livePrices, liveTokens, liveTxs, lk } from "@/lib/live";
import { signPermit } from "@/lib/sign";
import { socket } from "@/lib/socket";
import { errorText, toast } from "@/lib/toast";

const txDone: Record<string, string> = {
  deposit: "Deposit landed in your balance",
  trade: "Trade filled",
  withdraw: "Withdrawal sent",
  launch: "Coin launched",
  faucet: "Faucet MUSD added",
};

// owns the app wide socket topics and the silent auto deposit
export function LiveBridge() {
  const { address, signer } = useSession();
  const dep = useDeployment().data;
  const qc = useQueryClient();
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    socket.identify(address ?? undefined);
    liveBalances.set(null);
  }, [address]);

  useTopic(topicKey("prices"), (m) => {
    if (m.type !== "prices") return;
    livePrices.set((p) => {
      const next = { ...p };
      for (const x of m.prices) next[lk(x.address)] = { priceMusd: BigInt(x.priceMusd), change24h: x.change24h };
      return next;
    });
  });

  useTopic(topicKey("tokens"), (m) => {
    if (m.type !== "token") return;
    liveTokens.set((t) => ({ ...t, [lk(m.token.address)]: m.token }));
  });

  useTopic(address ? topicKey(`user:${address}`) : null, (m) => {
    if (m.type === "balances") {
      const toMap = (xs: { token: string; amount: string }[]) => Object.fromEntries(xs.map((x) => [lk(x.token), BigInt(x.amount)]));
      liveBalances.set({ block: m.block, vault: toMap(m.vault), wallet: toMap(m.wallet) });
      void qc.invalidateQueries({ queryKey: ["user"] });
      return;
    }
    if (m.type === "tx") {
      liveTxs.set((t) => ({ ...t, [m.tx.id]: m.tx }));
      if (m.tx.status === "confirmed") toast("success", txDone[m.tx.kind] ?? "Done");
      if (m.tx.status === "failed") toast("error", m.tx.error ? errorText(m.tx.error) : "Transaction failed");
    }
  });

  useEffect(() => {
    if (!signer || !dep) return;
    const sweepable = [dep.musd, dep.btc].map(lk);
    return liveBalances.subscribe(() => {
      const b = liveBalances.get();
      if (!b) return;
      for (const token of sweepable) {
        const amount = b.wallet[token] ?? 0n;
        const key = `${signer.address}:${token}:${amount}`;
        if (amount <= 0n || attempted.current.has(key)) continue;
        attempted.current.add(key);
        const addr = token === lk(dep.btc) ? dep.btc : dep.musd;
        signPermit(signer, dep, addr, amount)
          .then((body) => api.deposit(body))
          .catch((e: unknown) => toast("error", `Auto deposit: ${errorText(e)}`));
      }
    });
  }, [signer, dep]);

  return null;
}

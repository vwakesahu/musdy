"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { topicKey, type TokenInfo } from "shared";
import { useDeployment } from "@/hooks/use-deployment";
import { useSession } from "@/hooks/use-session";
import { useTopic } from "@/hooks/use-topic";
import { api } from "@/lib/http";
import { BTC_GAS_RESERVE, liveBalances, livePrices, liveTokens, liveTxs, lk } from "@/lib/live";
import { signPermit } from "@/lib/sign";
import { socket } from "@/lib/socket";
import { errorText, toast } from "@/lib/toast";
import { keyOf, mezoKey } from "@/lib/xchain";

const seedPrices = (list: TokenInfo[] | undefined) => {
  if (!list?.length) return;
  livePrices.set((p) => {
    const missing = list.filter((t) => !p[keyOf(t)]);
    if (missing.length === 0) return p;
    const next = { ...p };
    for (const t of missing) next[keyOf(t)] = { priceMusd: BigInt(t.priceMusd), change24h: t.change24h };
    return next;
  });
};

const txDone: Record<string, string> = {
  deposit: "Deposit landed in your balance",
  trade: "Trade filled",
  withdraw: "Withdrawal sent",
  launch: "Coin launched",
  faucet: "Faucet MUSD added",
  intent: "Trade filled",
  bridge: "Sale landed in your cash",
};

export function LiveBridge() {
  const { address, signer } = useSession();
  const dep = useDeployment().data;
  const qc = useQueryClient();
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    socket.identify(address ?? undefined);
    liveBalances.set(null);
  }, [address]);

  const trending = useQuery({ queryKey: ["tokens", "trending"], queryFn: () => api.tokens("trending") }).data;
  const fresh = useQuery({ queryKey: ["tokens", "new"], queryFn: () => api.tokens("new") }).data;
  const stocks = useQuery({ queryKey: ["tokens", "stocks"], queryFn: () => api.tokens("stocks") }).data;
  useEffect(() => seedPrices(trending), [trending]);
  useEffect(() => seedPrices(fresh), [fresh]);
  useEffect(() => seedPrices(stocks), [stocks]);

  useTopic(topicKey("prices"), (m) => {
    if (m.type !== "prices") return;
    livePrices.set((p) => {
      const next = { ...p };
      for (const x of m.prices) next[mezoKey(x.address)] = { priceMusd: BigInt(x.priceMusd), change24h: x.change24h };
      return next;
    });
  });

  useTopic(topicKey("tokens"), (m) => {
    if (m.type !== "token") return;
    liveTokens.set((t) => ({ ...t, [keyOf(m.token)]: m.token }));
    seedPrices([m.token]);
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
        const isBtc = token === lk(dep.btc);
        const held = b.wallet[token] ?? 0n;
        const amount = isBtc ? held - BTC_GAS_RESERVE : held;
        const key = `${signer.address}:${token}:${held}`;
        if (amount <= 0n || attempted.current.has(key)) continue;
        attempted.current.add(key);
        const addr = isBtc ? dep.btc : dep.musd;
        signPermit(signer, dep, addr, amount)
          .then((body) => api.deposit(body))
          .catch((e: unknown) => toast("error", `Auto deposit: ${errorText(e)}`));
      }
    });
  }, [signer, dep]);

  return null;
}

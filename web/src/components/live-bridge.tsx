"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { topicKey, vaultAbi, type TokenInfo, type TxStatus } from "shared";
import { activityForTx, loadActivity, logActivity, updateActivity } from "@/lib/activity";
import { mezoTx } from "@/lib/explorer";
import { tokenAmount } from "@/lib/format";
import { addOp, settleOp } from "@/lib/optimistic";
import { useDeployment } from "@/hooks/use-deployment";
import { useSession } from "@/hooks/use-session";
import { useTopic } from "@/hooks/use-topic";
import { api } from "@/lib/http";
import { BTC_GAS_RESERVE, liveBalances, livePrices, liveTokens, liveTxs, lk } from "@/lib/live";
import { publicClient } from "@/lib/chain";
import { signPermit, signSweep } from "@/lib/sign";
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

const SWEEP_MIN = 500_000n;
const SWEEP_CHAINS: Record<number, string> = { 8453: "Base", 42161: "Arbitrum", 10: "Optimism", 1: "Ethereum" };
const usd = (usdc: bigint) => `$${(Number(usdc) / 1e6).toFixed(2)}`;

const txDone: Record<TxStatus["kind"], string> = {
  deposit: "Deposit landed in your balance",
  trade: "Trade filled",
  withdraw: "Withdrawal sent",
  launch: "Coin launched",
  faucet: "Faucet MUSD added",
  intent: "Trade filled",
  bridge: "Deposit landed in your cash",
};
const txTitle: Record<TxStatus["kind"], string> = {
  deposit: "Deposit into your cash",
  trade: "Trade",
  withdraw: "Withdraw",
  launch: "Launch",
  faucet: "Faucet",
  intent: "Cross-chain trade",
  bridge: "Deposit from another chain",
};

function onTx(owner: string, tx: TxStatus) {
  liveTxs.set((t) => ({ ...t, [tx.id]: tx }));
  settleOp(tx);
  const ref = mezoTx(tx.hash);
  const act = activityForTx(tx.id);
  if (act) updateActivity(tx.id, { status: tx.status, tx: ref ?? act.tx, error: tx.error });
  else logActivity({ id: tx.id, txId: tx.id, owner, kind: tx.kind, title: txTitle[tx.kind], done: txDone[tx.kind], status: tx.status, tx: ref, error: tx.error });
  const done = act?.done || txDone[tx.kind];
  if (tx.status === "confirmed") toast("success", done, { key: tx.id, tx: ref });
  else if (tx.status === "failed") {
    const why = tx.error ? errorText(tx.error) : "The transaction failed.";
    toast("error", `${act ? act.title : txTitle[tx.kind]} didn't go through. ${why}${act?.kind === "trade" || act?.kind === "copy" || tx.kind === "intent" ? " Your cash is back." : ""}`, { key: tx.id, tx: ref });
  } else if (!act) toast("pending", `${txTitle[tx.kind]} on its way`, { key: tx.id, tx: ref });
}

const USDC_TO_MUSD = 10n ** 12n;

type Accept = { title: string; done: string; pending: string; cashDelta: bigint; cashBase: bigint | null };
function accepted(owner: string, tx: TxStatus, a: Accept) {
  const o = owner.toLowerCase();
  const known = liveTxs.get()[tx.id];
  const settled = !!known && known.status !== "pending";
  const hash = mezoTx(known?.hash ?? tx.hash);
  logActivity({ id: tx.id, txId: tx.id, owner: o, kind: tx.kind === "bridge" ? "sweep" : tx.kind, title: a.title, done: a.done, status: known?.status ?? "pending", tx: hash, error: known?.error });
  if (settled) return;
  liveTxs.set((t) => ({ ...t, [tx.id]: tx }));
  addOp({ txId: tx.id, owner: o, cashDelta: a.cashDelta, cashBase: a.cashBase });
  toast("pending", a.pending, { key: tx.id, tx: hash });
}

export function LiveBridge() {
  const { address, signer } = useSession();
  const dep = useDeployment().data;
  const qc = useQueryClient();
  const attempted = useRef(new Set<string>());
  const swept = useRef(new Set<string>());
  const solver = useQuery({
    queryKey: ["solver", dep?.vault],
    queryFn: () => publicClient.readContract({ address: dep!.vault, abi: vaultAbi, functionName: "solver" }),
    enabled: !!dep && !!signer,
    staleTime: Infinity,
  }).data;

  useEffect(() => {
    loadActivity(address);
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
      const external = (m.external ?? []).map((x) => ({ chainId: x.chainId, token: x.token, amount: BigInt(x.amount) }));
      liveBalances.set({ block: m.block, vault: toMap(m.vault), wallet: toMap(m.wallet), external });
      void qc.invalidateQueries({ queryKey: ["user"] });
      return;
    }
    if (m.type === "tx" && address) onTx(address, m.tx);
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
        const label = `${tokenAmount(amount)} ${isBtc ? "BTC" : "MUSD"}`;
        const cashBase = b.vault[lk(dep.musd)] ?? 0n;
        signPermit(signer, dep, addr, amount)
          .then((body) => api.deposit(body))
          .then((tx) => accepted(signer.address, tx, { title: `Deposit ${label}`, done: `${label} landed in your balance`, pending: `Moving ${label} into your balance`, cashDelta: isBtc ? 0n : amount, cashBase }))
          .catch((e: unknown) => toast("error", `Auto deposit: ${errorText(e)}`));
      }
    });
  }, [signer, dep]);

  useEffect(() => {
    if (!signer || !solver || /^0x0+$/.test(solver)) return;
    const sweep = () => {
      for (const x of liveBalances.get()?.external ?? []) {
        const name = SWEEP_CHAINS[x.chainId];
        const key = `${signer.address}:${x.chainId}:${x.amount}`;
        if (!name || x.amount < SWEEP_MIN || swept.current.has(key)) continue;
        swept.current.add(key);
        const cashBase = dep ? (liveBalances.get()?.vault[lk(dep.musd)] ?? null) : null;
        signSweep(signer, { chainId: x.chainId, token: x.token as Address, amount: x.amount, solver })
          .then((body) => api.sweep(body))
          .then((tx) =>
            accepted(signer.address, tx, {
              title: `Move ${usd(x.amount)} USDC from ${name}`,
              done: `${usd(x.amount)} from ${name} landed in your cash`,
              pending: `Moving ${usd(x.amount)} from ${name} into your balance`,
              cashDelta: x.amount * USDC_TO_MUSD,
              cashBase,
            }),
          )
          .catch((e: unknown) => toast("error", `Moving ${usd(x.amount)} from ${name}: ${errorText(e)}`));
      }
    };
    sweep();
    return liveBalances.subscribe(sweep);
  }, [signer, solver, dep]);

  return null;
}

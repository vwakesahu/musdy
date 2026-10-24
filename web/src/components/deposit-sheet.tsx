"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useActions } from "@/hooks/use-actions";
import { useDeployment } from "@/hooks/use-deployment";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { tokenAmount } from "@/lib/format";
import { ApiError, api } from "@/lib/http";
import { liveBalances, lk } from "@/lib/live";
import { createStore, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ArrowLeftIcon, CaretRightIcon, CheckIcon, CopySimpleIcon, DropIcon, LightningIcon } from "@phosphor-icons/react";
import type { Address } from "viem";
import { env } from "@/lib/env";
import { chainMeta } from "@/lib/xchain";
import { Skeleton } from "./ui/skeleton";
import { Drawer } from "./ui/drawer";

const DAY = 86_400_000;
const LIMITED = new Set(["faucet_limited", "faucet_ip_limited"]);
const claimKey = (address: string) => `musdy:faucet:${address.toLowerCase()}`;
const claimTick = createStore(0);

function readClaim(address: string, now: number): number | null {
  try {
    const at = Number(window.localStorage.getItem(claimKey(address)));
    return Number.isFinite(at) && at > 0 && now - at < DAY ? at : null;
  } catch {
    return null;
  }
}

function writeClaim(address: string) {
  try {
    window.localStorage.setItem(claimKey(address), String(Date.now()));
  } catch {}
  claimTick.set((n) => n + 1);
}

export function DepositSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address } = useSession();
  const dep = useDeployment().data;
  const actions = useActions();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, enabled: open, staleTime: 60_000 }).data;
  const faucetOn = health?.faucet === true;
  const faucetText = health ? Number(BigInt(health.faucetAmount) / 10n ** 18n).toLocaleString("en-US") : "";
  const chains = useQuery({ queryKey: ["depositChains"], queryFn: api.depositChains, enabled: open && !!address, staleTime: 300_000 });
  const wallet = useStore(liveBalances, (b) => b?.wallet ?? null, null);
  const incoming = dep && wallet ? [
    { symbol: "MUSD", amount: wallet[lk(dep.musd)] ?? 0n },
    { symbol: "BTC", amount: wallet[lk(dep.btc)] ?? 0n },
  ].filter((x) => x.amount > 0n) : [];

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(null);
  }

  useStore(claimTick, (n) => n, 0);
  const now = useNow();
  const claimedAt = address && open && now > 0 ? readClaim(address, now) : null;
  const hoursLeft = claimedAt ? Math.max(1, Math.min(24, Math.ceil((claimedAt + DAY - now) / 3_600_000))) : 0;

  const faucet = async () => {
    if (!address) return;
    setBusy(true);
    const res = await actions.faucet((e) => {
      if (e instanceof ApiError && LIMITED.has(e.code)) writeClaim(address);
    });
    setBusy(false);
    if (res) {
      writeClaim(address);
      toast("success", `Faucet request sent, ${faucetText} MUSD is on its way`);
    }
  };

  const row = "press flex w-full cursor-pointer items-center gap-3 rounded-[14px] bg-surface p-3 pr-4 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:hover:bg-surface";
  const other = chains.data?.find((c) => c.chainId === step) ?? null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Deposit">
      {!address ? (
        <p className="py-4 text-center text-[15px] text-muted">Log in to get your deposit address.</p>
      ) : step === null ? (
        <div className="flex flex-col gap-2 pt-1">
          <p className="px-1 pb-2 text-[14px] leading-5 text-muted">Where is your money now? Pick a chain, send to your address, and it lands as dollars in your balance.</p>
          <button className={row} onClick={() => setStep(env.chainId)} data-testid="deposit-chain-mezo">
            <ChainLogo chainId={env.chainId} />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] leading-5 font-medium">Mezo</span>
              <span className="mt-0.5 block text-[13px] leading-[17px] text-muted">MUSD or BTC, lands in seconds</span>
            </span>
            <span className="flex items-center gap-1 rounded-[6px] bg-up-soft px-1.5 text-[11px] leading-5 font-semibold text-up-sm">
              <LightningIcon size={11} weight="fill" />
              Direct
            </span>
            <CaretRightIcon size={16} weight="bold" className="text-muted" />
          </button>
          {chains.isPending ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-[14px]" />)
          ) : chains.isError ? (
            <p className="px-1 py-2 text-[13px] text-muted">Other chains can&apos;t be reached right now. Mezo deposits still work.</p>
          ) : (
            chains.data.map((c) => (
              <button key={c.chainId} className={row} onClick={() => setStep(c.chainId)} data-testid="deposit-chain">
                <ChainLogo chainId={c.chainId} fallback={c.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] leading-5 font-medium">{c.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-[17px] text-muted">{c.currency} or any token</span>
                </span>
                <CaretRightIcon size={16} weight="bold" className="text-muted" />
              </button>
            ))
          )}
          {incoming.map((x) => (
            <p key={x.symbol} className="px-1 text-[13px] text-muted" role="status">
              Moving {tokenAmount(x.amount)} {x.symbol} into your balance
            </p>
          ))}
          {faucetOn && (
            <button className={`${row} mt-2`} disabled={busy || claimedAt !== null} onClick={faucet} data-testid="faucet">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text">
                <DropIcon size={20} weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] leading-5 font-medium">
                  {busy ? "Requesting" : claimedAt !== null ? `Claimed, next in about ${hoursLeft}h` : `Get ${faucetText} test MUSD`}
                </span>
                <span className="mt-0.5 block text-[13px] leading-[17px] text-muted">Free testnet cash, once a day</span>
              </span>
            </button>
          )}
        </div>
      ) : step === env.chainId ? (
        <AddressStep
          chainId={step}
          name="Mezo"
          address={address}
          note="Send MUSD or BTC on Mezo. It moves into your cash on its own."
          incoming={incoming}
          onBack={() => setStep(null)}
        />
      ) : (
        <RemoteStep user={address} chainId={step} name={other?.name ?? chainMeta(step)?.name ?? "this chain"} fallbackIcon={other?.icon} onBack={() => setStep(null)} />
      )}
    </Drawer>
  );
}

function ChainLogo({ chainId, fallback, size = 40 }: { chainId: number; fallback?: string; size?: number }) {
  const src = chainMeta(chainId)?.icon ?? fallback;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" width={size} height={size} className="size-full object-cover" />}
    </span>
  );
}

function RemoteStep({ user, chainId, name, fallbackIcon, onBack }: { user: Address; chainId: number; name: string; fallbackIcon?: string; onBack: () => void }) {
  const q = useQuery({ queryKey: ["depositAddress", user.toLowerCase(), chainId], queryFn: () => api.depositAddress(user, chainId), staleTime: Infinity, retry: 1 });
  if (q.isPending)
    return (
      <StepFrame chainId={chainId} name={name} fallbackIcon={fallbackIcon} onBack={onBack}>
        <Skeleton className="size-[180px] rounded-[14px]" />
        <Skeleton className="h-[68px] w-full rounded-[14px]" />
      </StepFrame>
    );
  if (q.isError)
    return (
      <StepFrame chainId={chainId} name={name} fallbackIcon={fallbackIcon} onBack={onBack}>
        <p className="py-6 text-center text-[15px] leading-[21px] text-text-2" role="status" data-testid="deposit-unavailable">
          Deposits from {name} aren&apos;t open yet. Pick another chain or send on Mezo.
        </p>
      </StepFrame>
    );
  const d = q.data;
  return (
    <AddressStep
      chainId={chainId}
      name={d.name || name}
      fallbackIcon={d.icon || fallbackIcon}
      address={d.address}
      note="Send any token, it lands as dollars in your balance."
      min={d.minUsd}
      onBack={onBack}
    />
  );
}

function StepFrame({ chainId, name, fallbackIcon, onBack, children }: { chainId: number; name: string; fallbackIcon?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Choose another chain" className="press grid size-9 cursor-pointer place-items-center rounded-full hover:bg-surface-3">
          <ArrowLeftIcon size={20} weight="bold" />
        </button>
        <ChainLogo chainId={chainId} fallback={fallbackIcon} size={24} />
        <span className="text-[16px] leading-5 font-medium">From {name}</span>
      </div>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}

function AddressStep({
  chainId,
  name,
  fallbackIcon,
  address,
  note,
  min,
  incoming = [],
  onBack,
}: {
  chainId: number;
  name: string;
  fallbackIcon?: string;
  address: string;
  note: string;
  min?: number;
  incoming?: { symbol: string; amount: bigint }[];
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast("info", "Address copied");
    } catch {
      toast("error", "Couldn't copy, select the address instead");
    }
  };
  return (
    <StepFrame chainId={chainId} name={name} fallbackIcon={fallbackIcon} onBack={onBack}>
      <div className="mt-1 rounded-[14px] bg-white p-3">
        <QRCodeSVG value={address} size={156} bgColor="#ffffff" fgColor="#070510" marginSize={0} />
      </div>
      <p className="max-w-[300px] text-center text-[14px] leading-5 text-muted">{note}</p>
      <button
        onClick={copy}
        className="press flex w-full cursor-pointer items-center gap-4 rounded-[14px] bg-surface p-4 text-left transition-colors hover:bg-surface-3"
        data-testid="deposit-address"
        aria-label="Copy deposit address"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-5 font-medium">Your {name} address</span>
          <span className="mt-1 block font-mono text-[13px] leading-[17px] break-all text-muted">{address}</span>
        </span>
        <span className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${copied ? "bg-up-soft text-up" : "bg-surface-2 text-text"}`}>
          {copied ? <CheckIcon size={20} weight="bold" /> : <CopySimpleIcon size={20} weight="bold" />}
        </span>
      </button>
      {min !== undefined && min > 0 && (
        <p className="w-full px-1 text-[13px] leading-[17px] text-muted">
          Minimum <span className="text-text tabular-nums">${min.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>. Smaller sends can&apos;t be converted.
        </p>
      )}
      {incoming.map((x) => (
        <p key={x.symbol} className="w-full px-1 text-[13px] text-muted" role="status">
          Moving {tokenAmount(x.amount)} {x.symbol} into your balance
        </p>
      ))}
    </StepFrame>
  );
}

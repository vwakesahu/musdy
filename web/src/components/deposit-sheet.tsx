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
import { CheckIcon, CopySimpleIcon, DropIcon } from "@phosphor-icons/react";
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
  const [copied, setCopied] = useState(false);
  const faucetOn = useQuery({ queryKey: ["health"], queryFn: api.health, enabled: open, staleTime: 60_000 }).data?.faucet === true;
  const wallet = useStore(liveBalances, (b) => b?.wallet ?? null, null);
  const incoming = dep && wallet ? [
    { symbol: "MUSD", amount: wallet[lk(dep.musd)] ?? 0n },
    { symbol: "BTC", amount: wallet[lk(dep.btc)] ?? 0n },
  ].filter((x) => x.amount > 0n) : [];

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast("info", "Address copied");
    } catch {
      toast("error", "Couldn't copy, select the address instead");
    }
  };

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
      toast("success", "Faucet request sent, 1,000 MUSD is on its way");
    }
  };

  const row = "press flex w-full items-center gap-4 rounded-[14px] bg-surface p-4 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:hover:bg-surface";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Deposit">
      {!address ? (
        <p className="py-4 text-center text-[15px] text-muted">Log in to get your deposit address.</p>
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col items-center gap-3 pt-1 pb-3">
            <div className="rounded-[14px] bg-white p-3">
              <QRCodeSVG value={address} size={156} bgColor="#ffffff" fgColor="#070510" marginSize={0} />
            </div>
            <p className="max-w-[300px] text-center text-[14px] leading-5 text-muted">Send MUSD or BTC on Mezo. It moves into your cash on its own.</p>
          </div>
          <button onClick={copy} className={row} data-testid="deposit-address" aria-label="Copy deposit address">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] leading-5 font-medium">Your deposit address</span>
              <span className="mt-1 block font-mono text-[13px] leading-[17px] break-all text-muted">{address}</span>
            </span>
            <span className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${copied ? "bg-up-soft text-up" : "bg-surface-2 text-text"}`}>
              {copied ? <CheckIcon size={20} weight="bold" /> : <CopySimpleIcon size={20} weight="bold" />}
            </span>
          </button>
          {incoming.map((x) => (
            <p key={x.symbol} className="px-1 text-[13px] text-muted" role="status">
              Moving {tokenAmount(x.amount)} {x.symbol} into your balance
            </p>
          ))}
          {faucetOn && (
            <button className={row} disabled={busy || claimedAt !== null} onClick={faucet} data-testid="faucet">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] leading-5 font-medium">
                  {busy ? "Requesting" : claimedAt !== null ? `Claimed, next in about ${hoursLeft}h` : "Get 1,000 test MUSD"}
                </span>
                <span className="mt-1 block text-[13px] leading-[17px] text-muted">Free testnet cash, once a day</span>
              </span>
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text">
                <DropIcon size={20} weight="fill" />
              </span>
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}

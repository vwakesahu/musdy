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
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { Sheet } from "./ui/sheet";

const DAY = 86_400_000;
const LIMITED = new Set(["faucet_limited", "faucet_ip_limited"]);
const claimKey = (address: string) => `musdy:faucet:${address.toLowerCase()}`;
// bumps when a claim is written so the sheet re-reads storage
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add cash">
      {!address ? (
        <p className="text-[14px] text-muted">Log in to get your deposit address.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-5 text-muted">
            Send MUSD or BTC to your deposit address. It moves into your balance on its own.
          </p>
          <div className="flex justify-center rounded-[20px] bg-raised p-5">
            <QRCodeSVG value={address} size={168} bgColor="#1D1A25" fgColor="#F4F1EA" marginSize={0} />
          </div>
          <p className="-mb-2 text-[12px] leading-4 font-medium text-muted">Your deposit address</p>
          <button onClick={copy} className="press flex items-center gap-3 rounded-[14px] bg-raised px-4 py-3 text-left" data-testid="deposit-address">
            <span className="flex-1 font-mono text-[13px] leading-5 break-all">{address}</span>
            <Icon name="copy" size={20} className="shrink-0 text-muted" />
          </button>
          {incoming.map((x) => (
            <p key={x.symbol} className="text-[13px] text-muted" role="status">
              Moving {tokenAmount(x.amount)} {x.symbol} into your balance
            </p>
          ))}
          {faucetOn && (
            <Button variant="raised" className="h-[52px] w-full" disabled={busy || claimedAt !== null} onClick={faucet} data-testid="faucet">
              <Icon name="drop" size={20} />
              {busy ? "Requesting" : claimedAt !== null ? `Claimed, next in about ${hoursLeft}h` : "Get 1,000 test MUSD"}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

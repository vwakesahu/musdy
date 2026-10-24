"use client";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useActions } from "@/hooks/use-actions";
import { useDeployment } from "@/hooks/use-deployment";
import { useCash, useProfile } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { useSession } from "@/hooks/use-session";
import { tokenAmount, usd } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { Sheet } from "./ui/sheet";
import { TokenIcon } from "./ui/token-icon";

type Asset = { address: Address; symbol: string; image: string | null; decimals: number; amount: bigint; withdrawable: boolean };

export function WithdrawSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address } = useSession();
  const dep = useDeployment().data;
  const cash = useCash();
  const profile = useProfile(address).data;
  const actions = useActions();
  const [selected, setSelected] = useState<Address | null>(null);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [locked, setLocked] = useState<string | null>(null);
  const { run, sending, confirmed } = useTxRun();

  const assets: Asset[] = [
    ...(dep && cash !== null && cash > 0n ? [{ address: dep.musd, symbol: "MUSD", image: null, decimals: 18, amount: cash, withdrawable: true }] : []),
    ...(profile?.positions ?? [])
      .filter((p) => BigInt(p.amount) > 0n)
      .map((p) => ({ ...p.token, amount: BigInt(p.amount), withdrawable: p.withdrawable })),
  ];
  const asset = assets.find((a) => a.address === selected) ?? null;

  let amountWei = 0n;
  try {
    amountWei = asset && amount ? parseUnits(amount, asset.decimals) : 0n;
  } catch {
    amountWei = 0n;
  }
  const validTo = isAddress(to);
  const tooMuch = asset !== null && amountWei > asset.amount;

  useEffect(() => {
    if (confirmed) onOpenChange(false);
  }, [confirmed, onOpenChange]);

  const submit = async () => {
    if (!asset || !validTo) return;
    setLocked(null);
    const res = await run(() =>
      actions.withdraw({ token: asset.address, amount: amountWei, to: to as Address }, (e) => {
        if (e instanceof ApiError && e.code === "curve_locked") setLocked(`${asset.symbol} is still on its launch curve. It can leave the vault once the coin graduates to a Mezo pool. ${e.message}`);
      }),
    );
    if (res) setAmount("");
  };

  const setPct = (p: bigint) => {
    if (!asset) return;
    const v = (asset.amount * p) / 100n;
    setAmount(formatUnits(v, asset.decimals));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Withdraw">
      {assets.length === 0 ? (
        <p className="py-6 text-[14px] text-muted">Nothing to withdraw yet. Your balance is empty.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col">
            {assets.map((a) => (
              <li key={a.address}>
                <button
                  disabled={!a.withdrawable}
                  onClick={() => {
                    setSelected(a.address);
                    setLocked(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left ${selected === a.address ? "bg-raised" : ""}`}
                >
                  <TokenIcon token={a} size={32} />
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">{a.symbol}</span>
                    {a.withdrawable ? (
                      <span className="block text-[13px] text-muted">{a.symbol === "MUSD" ? usd(a.amount, true) : `${tokenAmount(a.amount, a.decimals)} ${a.symbol}`}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[13px] text-muted">
                        <Icon name="lock" size={14} /> Still on its launch curve. It can leave after the coin graduates.
                      </span>
                    )}
                  </span>
                  {selected === a.address && <Icon name="check" size={20} className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          {asset && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-muted">Amount in {asset.symbol}</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0"
                  className="h-12 rounded-[14px] bg-raised px-4 text-[16px] outline-none placeholder:text-muted"
                />
              </label>
              <div className="flex gap-2">
                {[25n, 50n, 100n].map((p) => (
                  <button key={String(p)} onClick={() => setPct(p)} className="press h-9 flex-1 rounded-full bg-raised text-[14px] font-medium">
                    {String(p)}%
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-muted">To address on Mezo</span>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value.trim())}
                  placeholder="0x…"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 rounded-[14px] bg-raised px-4 font-mono text-[16px] outline-none placeholder:text-muted"
                />
              </label>
              {tooMuch && <p className="text-[13px] text-muted">That&apos;s more than you hold.</p>}
              {locked && (
                <p className="flex items-start gap-2 text-[13px] leading-5 text-muted" role="alert" data-testid="withdraw-locked">
                  <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
                  {locked}
                </p>
              )}
              <Button variant="accent" className="h-[52px] w-full" disabled={!validTo || amountWei === 0n || tooMuch || sending} onClick={submit}>
                {sending ? "Sending" : `Withdraw ${asset.symbol}`}
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

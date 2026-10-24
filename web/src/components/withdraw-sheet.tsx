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
  const choices = assets.filter((a) => a.withdrawable);
  const lockedCount = assets.length - choices.length;
  const asset = choices.find((a) => a.address === selected) ?? null;

  let amountWei = 0n;
  let amountBad = false;
  try {
    amountWei = asset && amount ? parseUnits(amount, asset.decimals) : 0n;
  } catch {
    amountBad = true;
  }
  if (amount && !/^\d*\.?\d+$|^\d+\.$/.test(amount)) amountBad = true;
  const validTo = isAddress(to);
  const toBad = to !== "" && !validTo;
  const tooMuch = asset !== null && amountWei > asset.amount;

  useEffect(() => {
    if (confirmed) onOpenChange(false);
  }, [confirmed, onOpenChange]);

  const submit = async () => {
    if (!asset || !validTo) return;
    setLocked(null);
    const res = await run(() =>
      actions.withdraw({ token: asset.address, amount: amountWei, to: to as Address }, (e) => {
        if (e instanceof ApiError && e.code === "curve_locked") setLocked(`${asset.symbol} is still on its launch curve. It can leave once the coin graduates. ${e.message}`);
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
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1">
            {choices.map((a) => (
              <li key={a.address} className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setSelected(a.address);
                    setLocked(null);
                    setAmount("");
                  }}
                  data-testid="withdraw-asset"
                  className={`flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left ${selected === a.address ? "bg-raised" : ""}`}
                >
                  <TokenIcon token={a} size={32} />
                  <span className="flex-1">
                    <span className="block text-[15px] font-medium">{a.symbol}</span>
                    <span className="block text-[13px] text-muted">{a.symbol === "MUSD" ? usd(a.amount, true) : `${tokenAmount(a.amount, a.decimals)} ${a.symbol}`}</span>
                  </span>
                  {selected === a.address && <Icon name="check" size={20} className="text-accent" />}
                </button>
                {asset?.address === a.address && (
                  <div className="flex flex-col gap-4 pb-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium text-muted">Amount in {asset.symbol}</span>
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0"
                        aria-invalid={amountBad}
                        className="h-12 rounded-[14px] bg-raised px-4 text-[16px] outline-none placeholder:text-muted"
                      />
                      {amountBad && (
                        <span role="alert" className="text-[13px] leading-5 text-muted" data-testid="withdraw-amount-error">
                          That amount isn&apos;t a number. Use digits and one decimal point, like 12.5.
                        </span>
                      )}
                      {!amountBad && tooMuch && <span className="text-[13px] leading-5 text-muted">That&apos;s more than you hold.</span>}
                    </label>
                    <div className="flex gap-2">
                      {[25n, 50n, 100n].map((p) => (
                        <button key={String(p)} onClick={() => setPct(p)} className="press h-11 flex-1 rounded-full bg-raised text-[14px] font-medium">
                          {String(p)}%
                        </button>
                      ))}
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12px] font-medium text-muted">To address</span>
                      <input
                        value={to}
                        onChange={(e) => setTo(e.target.value.trim())}
                        placeholder="0x…"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={toBad}
                        className="h-12 rounded-[14px] bg-raised px-4 font-mono text-[16px] outline-none placeholder:text-muted"
                      />
                      {toBad && (
                        <span role="alert" className="text-[13px] leading-5 text-muted" data-testid="withdraw-to-error">
                          That isn&apos;t a valid address. It&apos;s 0x followed by 40 letters and digits.
                        </span>
                      )}
                    </label>
                    {locked && (
                      <p className="flex items-start gap-2 text-[13px] leading-5 text-muted" role="alert" data-testid="withdraw-locked">
                        <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
                        {locked}
                      </p>
                    )}
                    <Button variant="accent" className="h-[52px] w-full" disabled={!validTo || amountBad || amountWei === 0n || tooMuch || sending} onClick={submit}>
                      {sending ? "Sending" : `Withdraw ${asset.symbol}`}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {choices.length === 0 && <p className="py-2 text-[14px] text-muted">Nothing can be withdrawn right now.</p>}
          {lockedCount > 0 && (
            <p className="flex items-start gap-2 px-3 py-2 text-[13px] leading-5 text-muted" data-testid="withdraw-curve-locked">
              <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
              {lockedCount} {lockedCount === 1 ? "coin" : "coins"} still on {lockedCount === 1 ? "its" : "their"} launch curve can leave after {lockedCount === 1 ? "it graduates" : "they graduate"}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

"use client";
import { useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useActions } from "@/hooks/use-actions";
import { useDeployment } from "@/hooks/use-deployment";
import { useCash, useProfile, useTx } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { useSession } from "@/hooks/use-session";
import { tokenAmount, usd } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { Button } from "./ui/button";
import { ArrowSquareOutIcon, ArrowUpIcon, CheckIcon, LockSimpleIcon, WalletIcon } from "@phosphor-icons/react";
import { chain } from "@/lib/chain";
import { cn } from "@/lib/utils";
import { Drawer } from "./ui/drawer";
import { isMezo } from "@/lib/xchain";
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
  const { run, sending, confirmed, txId } = useTxRun();
  const tx = useTx(txId);
  const [pending, setPending] = useState<{ label: string; to: string } | null>(null);

  const assets: Asset[] = [
    ...(dep && cash !== null && cash > 0n ? [{ address: dep.musd, symbol: "MUSD", image: "/tokens/musd.svg", decimals: 18, amount: cash, withdrawable: true }] : []),
    ...(profile?.positions ?? [])
      .filter((p) => BigInt(p.amount) > 0n && isMezo(p.token))
      .map((p) => ({ ...p.token, address: p.token.address as Address, amount: BigInt(p.amount), withdrawable: p.withdrawable })),
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

  const done = confirmed && pending ? { ...pending, hash: tx?.hash ?? null } : null;

  const change = (o: boolean) => {
    if (!o) {
      setPending(null);
      setSelected(null);
      setAmount("");
    }
    onOpenChange(o);
  };

  const submit = async () => {
    if (!asset || !validTo) return;
    setLocked(null);
    setPending({ label: asset.symbol === "MUSD" ? usd(amountWei, true) : `${tokenAmount(amountWei, asset.decimals)} ${asset.symbol}`, to });
    const res = await run(() =>
      actions.withdraw({ token: asset.address, amount: amountWei, to: to as Address }, (e) => {
        if (e instanceof ApiError && e.code === "curve_locked") setLocked(`${asset.symbol} is still on its launch curve. It can leave once the coin graduates. ${e.message}`);
      }),
    );
    if (!res) setPending(null);
  };

  const setPct = (p: bigint) => {
    if (!asset) return;
    const v = (asset.amount * p) / 100n;
    setAmount(formatUnits(v, asset.decimals));
  };

  return (
    <Drawer open={open} onOpenChange={change} title={done ? "Withdrew" : "Withdraw"} hideTitle={done !== null}>
      {done ? (
        <WithdrawDone done={done} onClose={() => change(false)} />
      ) : assets.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-muted">Nothing to withdraw yet. Your balance is empty.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="pb-1 text-[14px] leading-5 text-muted">Pick what to send out. It goes to any Mezo address.</p>
          <ul className="flex flex-col gap-2">
            {choices.map((a) => (
              <li key={a.address} className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setSelected(a.address);
                    setLocked(null);
                    setAmount("");
                  }}
                  data-testid="withdraw-asset"
                  className={cn(
                    "press flex min-h-[72px] w-full items-center gap-3 rounded-[14px] border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-3",
                    selected === a.address ? "border-accent-hi" : "border-transparent",
                  )}
                >
                  <TokenIcon token={a} size={40} />
                  <span className="flex-1">
                    <span className="block text-[16px] leading-5 font-medium">{a.symbol}</span>
                    <span className="mt-1 block text-[13px] text-muted">{a.symbol === "MUSD" ? usd(a.amount, true) : `${tokenAmount(a.amount, a.decimals)} ${a.symbol}`}</span>
                  </span>
                  {selected === a.address && <CheckIcon size={20} weight="bold" className="text-accent-hi" />}
                </button>
                {asset?.address === a.address && (
                  <div className="flex flex-col gap-4 px-1 pt-1 pb-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-muted">Amount in {asset.symbol}</span>
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0"
                        aria-invalid={amountBad}
                        className="h-[52px] rounded-[14px] border border-border bg-surface px-4 text-[16px] outline-none placeholder:text-faint focus:border-accent-hi"
                      />
                      {amountBad && (
                        <span role="alert" className="text-[13px] leading-5 text-down" data-testid="withdraw-amount-error">
                          That amount isn&apos;t a number. Use digits and one decimal point, like 12.5.
                        </span>
                      )}
                      {!amountBad && tooMuch && <span className="text-[13px] leading-5 text-down">That&apos;s more than you hold.</span>}
                    </label>
                    <div className="flex gap-2">
                      {[25n, 50n, 100n].map((p) => (
                        <button key={String(p)} onClick={() => setPct(p)} className="press h-9 flex-1 rounded-[10px] bg-surface-2 text-[14px] font-semibold transition-colors hover:bg-surface-3">
                          {String(p)}%
                        </button>
                      ))}
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-muted">To address</span>
                      <input
                        value={to}
                        onChange={(e) => setTo(e.target.value.trim())}
                        placeholder="0x…"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={toBad}
                        className="h-[52px] rounded-[14px] border border-border bg-surface px-4 font-mono text-[16px] outline-none placeholder:text-faint focus:border-accent-hi"
                      />
                      {toBad && (
                        <span role="alert" className="text-[13px] leading-5 text-down" data-testid="withdraw-to-error">
                          That isn&apos;t a valid address. It&apos;s 0x followed by 40 letters and digits.
                        </span>
                      )}
                    </label>
                    {locked && (
                      <p className="flex items-start gap-2 text-[13px] leading-5 text-muted" role="alert" data-testid="withdraw-locked">
                        <LockSimpleIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
                        {locked}
                      </p>
                    )}
                    <Button variant="primary" size="lg" className="w-full" disabled={!validTo || amountBad || amountWei === 0n || tooMuch || sending} onClick={submit}>
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
              <LockSimpleIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
              {lockedCount} {lockedCount === 1 ? "coin" : "coins"} still on {lockedCount === 1 ? "its" : "their"} launch curve can leave after {lockedCount === 1 ? "it graduates" : "they graduate"}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function WithdrawDone({ done, onClose }: { done: { label: string; to: string; hash: string | null }; onClose: () => void }) {
  const explorer = chain.blockExplorers?.default.url;
  return (
    <div className="flex min-h-[440px] flex-col" data-testid="withdraw-success">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
        <span className="mb-4 grid size-20 animate-in place-items-center rounded-full bg-up text-black zoom-in-60 duration-300">
          <ArrowUpIcon size={36} weight="bold" />
        </span>
        <p className="text-[24px] leading-[30px] font-medium">Withdrew</p>
        <p className="text-[34px] leading-10 font-medium tracking-[-0.02em] tabular-nums">{done.label}</p>
        <p className="mt-3 flex items-center gap-2 text-[15px] text-text-2">
          <WalletIcon size={18} weight="fill" className="text-muted" />
          {short(done.to)}
        </p>
        {explorer && done.hash && (
          <a href={`${explorer}/tx/${done.hash}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-accent hover:underline">
            View on explorer <ArrowSquareOutIcon size={16} weight="bold" />
          </a>
        )}
      </div>
      <button onClick={onClose} className="press relative flex h-14 w-full items-center justify-center rounded-[14px] bg-up text-[17px] font-semibold text-black transition-[filter] hover:brightness-110">
        Withdraw complete
        <CheckIcon size={22} weight="bold" className="absolute right-5" />
      </button>
    </div>
  );
}

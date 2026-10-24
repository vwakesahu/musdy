"use client";
import { useEffect, useRef, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useActions, type Meta } from "@/hooks/use-actions";
import { useDeployment } from "@/hooks/use-deployment";
import { useProfile, useServerCash } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { useSession } from "@/hooks/use-session";
import { tokenAmount, usd } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { MorphButton } from "./ui/morph-button";
import { ArrowSquareOutIcon, CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { env } from "@/lib/env";
import { mezoTx, txUrl } from "@/lib/explorer";

const CLOSE_AFTER_TICK_MS = 900;
import { cn } from "@/lib/utils";
import { Drawer } from "./ui/drawer";
import { isMezo } from "@/lib/xchain";
import { TokenIcon } from "./ui/token-icon";

type Asset = { address: Address; symbol: string; image: string | null; decimals: number; amount: bigint; withdrawable: boolean };

export function WithdrawSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address } = useSession();
  const dep = useDeployment().data;
  const cash = useServerCash();
  const positions = useProfile(address).data?.positions;
  const actions = useActions();
  const [selected, setSelected] = useState<Address | null>(null);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [locked, setLocked] = useState<string | null>(null);
  const { run, morph, accepted, tx, reset } = useTxRun();
  const [pending, setPending] = useState<{ label: string; to: string } | null>(null);

  const assets: Asset[] = [
    ...(dep && cash !== null && cash > 0n ? [{ address: dep.musd, symbol: "MUSD", image: "/tokens/musd.svg", decimals: 18, amount: cash, withdrawable: true }] : []),
    ...(positions ?? [])
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

  const change = (o: boolean) => {
    if (!o) {
      setPending(null);
      setSelected(null);
      setAmount("");
      reset();
    }
    onOpenChange(o);
  };

  const closeRef = useRef(change);
  useEffect(() => {
    closeRef.current = change;
  });
  useEffect(() => {
    if (!accepted) return;
    const t = setTimeout(() => closeRef.current(false), CLOSE_AFTER_TICK_MS);
    return () => clearTimeout(t);
  }, [accepted]);

  const submit = async () => {
    if (!asset || !validTo) return;
    setLocked(null);
    const label = asset.symbol === "MUSD" ? `${usd(amountWei, true)} MUSD` : `${tokenAmount(amountWei, asset.decimals)} ${asset.symbol}`;
    setPending({ label, to });
    const musd = asset.symbol === "MUSD";
    const meta: Meta = {
      kind: "withdraw",
      title: `Withdraw ${label} to ${short(to)}`,
      done: `Withdrawal sent, ${label} to ${short(to)}`,
      pending: `Sending ${label} to ${short(to)}`,
      cashDelta: musd ? -amountWei : 0n,
      pos: musd ? undefined : { token: { address: asset.address, chainId: env.chainId, symbol: asset.symbol, name: asset.symbol, image: asset.image, decimals: asset.decimals }, delta: -amountWei, musd: 0n },
    };
    const res = await run(() =>
      actions.withdraw({ token: asset.address, amount: amountWei, to: to as Address }, meta, (e) => {
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
    <Drawer open={open} onOpenChange={change} title="Withdraw">
      {assets.length === 0 && !pending ? (
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
                    <MorphButton state={morph} className="w-full" disabled={morph === "idle" && (!validTo || amountBad || amountWei === 0n || tooMuch)} onClick={submit} doneLabel="Sent">
                      {`Withdraw ${asset.symbol}`}
                    </MorphButton>
                    {accepted && pending && <WithdrawOutcome label={pending.label} to={pending.to} hash={tx?.hash ?? null} />}
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

function WithdrawOutcome({ label, to, hash }: { label: string; to: string; hash: string | null }) {
  const ref = mezoTx(hash);
  const url = ref ? txUrl(ref) : null;
  return (
    <p className="-mt-1 flex items-center justify-center gap-2 text-[14px] leading-5 font-medium animate-in fade-in duration-200" role="status" data-testid="withdraw-success">
      <span className="text-up">
        {label} on its way to {short(to)}
      </span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          View tx <ArrowSquareOutIcon size={14} weight="bold" />
        </a>
      )}
    </p>
  );
}

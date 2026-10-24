"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs, type Address, type Hex } from "viem";
import { LaunchBody, vaultAbi } from "shared";
import { LoginGate } from "../login-gate";
import { ScreenHeader } from "../screen-header";
import { Button } from "../ui/button";
import { CurveBar } from "../ui/curve-bar";
import { TokenIcon } from "../ui/token-icon";
import { useActions } from "@/hooks/use-actions";
import { useCash, useTx } from "@/hooks/use-live";
import { useSession } from "@/hooks/use-session";
import { useTxRun } from "@/hooks/use-tx-run";
import { parseDollars, usd } from "@/lib/format";
import { openSheet } from "@/lib/ui";
import { publicClient } from "@/lib/chain";
import { liveTokens, lk } from "@/lib/live";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { RightRail } from "../right-rail";

const rules = LaunchBody.shape.launch.shape;
const issue = (r: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, v: string) => {
  const res = r.safeParse(v);
  return res.success ? null : (res.error?.issues[0]?.message ?? "invalid");
};

async function launchedToken(hash: Hex, user: Address): Promise<Address | null> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const logs = parseEventLogs({ abi: vaultAbi, eventName: "Launched", logs: receipt.logs });
    const mine = logs.find((l) => lk(l.args.user) === lk(user));
    return mine ? mine.args.token : null;
  } catch {
    return null;
  }
}

const nowSec = () => Math.floor(Date.now() / 1000);

const field = "h-[52px] w-full rounded-[14px] border border-border bg-surface px-4 text-[16px] outline-none transition-colors placeholder:text-faint focus:border-accent-hi";
const labelCls = "text-[13px] leading-[17px] font-medium text-muted";

export function LaunchScreen() {
  return (
    <>
      <ScreenHeader title="Launch a coin" />
      <LoginGate title="Launch a coin in one step" body="Log in to name it, pick a ticker and make the first buy. No gas, no wallet popups.">
        <LaunchForm />
      </LoginGate>
    </>
  );
}

function LaunchForm() {
  const router = useRouter();
  const actions = useActions();
  const cash = useCash();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [buy, setBuy] = useState("");
  const { address } = useSession();
  const { run, sending, confirmed, txId } = useTxRun();
  const tx = useTx(txId);
  const launching = useRef<{ symbol: string; at: number } | null>(null);
  const went = useRef(false);

  const initialBuy = parseDollars(buy);
  const nameOk = issue(rules.name, name.trim()) === null;
  const symbolOk = issue(rules.symbol, symbol) === null;
  const imageError = image === "" ? null : issue(rules.image, image);
  const imageOk = imageError === null;
  const short = cash !== null && initialBuy > cash;
  const ok = nameOk && symbolOk && imageOk && !short && !sending;

  const go = (token: Address | null) => {
    if (went.current) return;
    went.current = true;
    router.push(token ? `/token/${token}` : "/explore?sort=new");
  };

  useEffect(() => {
    if (!txId || !address) return;
    const check = () => {
      const l = launching.current;
      const fresh = l && Object.values(liveTokens.get()).find((t) => t.creator && lk(t.creator) === lk(address) && t.symbol === l.symbol && t.createdAt >= l.at - 60);
      if (fresh) go(fresh.address);
    };
    check();
    return liveTokens.subscribe(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId, address]);

  useEffect(() => {
    if (!confirmed || !address) return;
    let live = true;
    const hash = tx?.hash ?? null;
    void (hash ? launchedToken(hash, address) : Promise.resolve(null)).then((token) => {
      if (!live) return;
      if (token) go(token);
      else setTimeout(() => go(null), 3000);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, address, tx?.hash]);

  const desktop = useIsDesktop();
  const preview = (
    <section aria-label="Preview" data-testid="launch-preview">
      <h2 className="mb-3 text-[17px] leading-[22px] font-medium tracking-[-0.01em]">Preview</h2>
      <div className="rounded-[14px] border border-border p-4">
        <div className="flex items-center gap-3">
          <TokenIcon token={{ symbol: symbol || "?", image: imageOk && image ? image : null }} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] leading-5 font-medium">{symbol || "TICKER"}</p>
            <p className="mt-1 truncate text-[13px] leading-[17px] text-muted">{name.trim() || "Coin name"}</p>
          </div>
          <span className="text-right">
            <span className="block text-[16px] leading-5 font-medium tabular-nums">{usd(initialBuy, true)}</span>
            <span className="mt-1 block text-[13px] leading-[17px] text-muted">First buy</span>
          </span>
        </div>
        <div className="mt-4">
          <CurveBar progress={0} />
        </div>
        <p className="mt-2 text-[13px] leading-[17px] text-muted">Starts on a launch curve and moves to a Mezo pool once about $4,250 is raised.</p>
      </div>
    </section>
  );

  const submit = () => {
    launching.current = { symbol, at: nowSec() };
    went.current = false;
    return run(() => actions.launch({ name: name.trim(), symbol, image, initialBuy }));
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-8 lg:px-6">
      <p className="text-[15px] leading-[21px] text-muted">Name it, pick a ticker and make the first buy. No gas, no wallet popups.</p>
      {!desktop && preview}

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="What it's called" className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Ticker, up to 10 characters</span>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 10))}
          placeholder="TICKER"
          autoCapitalize="characters"
          autoCorrect="off"
          className={`${field} font-semibold uppercase`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Image URL, optional</span>
        <input
          value={image}
          onChange={(e) => setImage(e.target.value.trim())}
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className={field}
        />
        {imageError && <span className="text-[12px] text-muted">{imageError === "Invalid url" ? "That doesn't look like a link. Use http or https, 256 bytes at most." : `${imageError[0].toUpperCase()}${imageError.slice(1)}.`}</span>}
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="first-buy" className={labelCls}>
          First buy in USD, optional
        </label>
        <input
          id="first-buy"
          value={buy}
          onChange={(e) => setBuy(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder="$0"
          className={field}
        />
        <div className="mt-1 flex gap-2">
          {[0, 10, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => setBuy(n ? String(n) : "")}
              className={cn(
                "press h-9 flex-1 rounded-[10px] border text-[14px] font-semibold transition-colors",
                (n ? String(n) : "") === buy ? "border-border-strong bg-surface text-text" : "border-border-strong bg-transparent text-muted hover:text-text",
              )}
            >
              {n ? `$${n}` : "None"}
            </button>
          ))}
        </div>
        {short && (
          <p className="mt-1 flex items-center gap-2 text-[13px] text-down">
            You have {usd(cash ?? 0n, true)} cash.
            <Button variant="secondary" size="sm" onClick={() => openSheet("deposit")}>
              Deposit
            </Button>
          </p>
        )}
      </div>
      <Button variant="primary" size="lg" className="w-full" disabled={!ok} onClick={submit} data-testid="launch-submit">
        {sending ? "Launching" : symbol ? `Launch ${symbol}` : "Launch"}
      </Button>
      {desktop && <RightRail>{preview}</RightRail>}
    </div>
  );
}

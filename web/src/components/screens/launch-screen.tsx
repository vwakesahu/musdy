"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginGate } from "../login-gate";
import { ScreenHeader } from "../screen-header";
import { Button } from "../ui/button";
import { CurveBar } from "../ui/curve-bar";
import { TokenIcon } from "../ui/token-icon";
import { useActions } from "@/hooks/use-actions";
import { useCash } from "@/hooks/use-live";
import { useTxRun } from "@/hooks/use-tx-run";
import { parseDollars, usd } from "@/lib/format";
import { openSheet } from "@/lib/ui";

const bytes = (s: string) => new TextEncoder().encode(s).length;
const validUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

const field = "h-12 w-full rounded-[14px] bg-surface px-4 text-[16px] outline-none placeholder:text-muted focus:bg-raised";

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
  const { run, sending, confirmed } = useTxRun();

  const initialBuy = parseDollars(buy);
  const nameOk = bytes(name.trim()) >= 1 && bytes(name.trim()) <= 32;
  const symbolOk = bytes(symbol) >= 1 && bytes(symbol) <= 10;
  const imageOk = image === "" || (validUrl(image) && image.length <= 256);
  const short = cash !== null && initialBuy > cash;
  const ok = nameOk && symbolOk && imageOk && !short && !sending;

  useEffect(() => {
    if (confirmed) router.push("/explore");
  }, [confirmed, router]);

  const submit = () => run(() => actions.launch({ name: name.trim(), symbol, image, initialBuy }));

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-8">
      <section className="rounded-[20px] bg-surface p-4" aria-label="Preview" data-testid="launch-preview">
        <p className="label">Preview</p>
        <div className="mt-3 flex items-center gap-3">
          <TokenIcon token={{ symbol: symbol || "?", image: imageOk && image ? image : null }} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-[22px] font-semibold">{symbol || "TICKER"}</p>
            <p className="truncate text-[14px] leading-5 text-muted">{name.trim() || "Coin name"}</p>
          </div>
          <span className="text-right text-[12px] leading-4 text-muted">
            first buy
            <br />
            <span className="text-[15px] leading-[22px] font-medium text-text">{usd(initialBuy, true)}</span>
          </span>
        </div>
        <div className="mt-4">
          <CurveBar progress={0} />
        </div>
        <p className="mt-2 text-[12px] leading-4 text-muted">Starts on a launch curve and moves to a Mezo pool once about $4,250 is raised.</p>
      </section>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] leading-4 font-medium text-muted">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="What it's called" className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] leading-4 font-medium text-muted">Ticker, up to 10 characters</span>
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
        <span className="text-[12px] leading-4 font-medium text-muted">Image URL, optional</span>
        <input
          value={image}
          onChange={(e) => setImage(e.target.value.trim())}
          placeholder="https://"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className={field}
        />
        {!imageOk && <span className="text-[12px] text-muted">That doesn&apos;t look like a link. Use http or https, 256 characters at most.</span>}
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="first-buy" className="text-[12px] leading-4 font-medium text-muted">
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
            <button key={n} onClick={() => setBuy(n ? String(n) : "")} className="press h-9 flex-1 rounded-full bg-raised text-[14px] font-medium">
              {n ? `$${n}` : "None"}
            </button>
          ))}
        </div>
        {short && (
          <button onClick={() => openSheet("deposit")} className="mt-1 self-start text-[13px] text-muted underline">
            You have {usd(cash ?? 0n, true)} cash. Add more
          </button>
        )}
      </div>
      <Button variant="accent" className="h-[52px] w-full" disabled={!ok} onClick={submit} data-testid="launch-submit">
        {sending ? "Launching" : symbol ? `Launch ${symbol}` : "Launch"}
      </Button>
    </div>
  );
}

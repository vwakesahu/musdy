"use client";
import Image from "next/image";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { devKeyState, env } from "@/lib/env";
import { Button } from "./ui/button";
import { Drawer } from "./ui/drawer";

export function LoginOptions() {
  const s = useSession();
  return (
    <div className="flex flex-col gap-3">
      {s.canPrivy && (
        <Button variant="white" size="lg" className="w-full" onClick={s.loginPrivy} disabled={s.loginBusy} data-testid="google-login">
          {s.loginBusy ? "Signing in with Google" : "Continue with Google"}
        </Button>
      )}
      {s.canDev && (
        <Button variant="secondary" size="lg" className="w-full" onClick={s.loginDev} data-testid="dev-login">
          Dev login (local anvil)
        </Button>
      )}
      {s.configError && (
        <p role="alert" className="rounded-[14px] bg-down-soft p-4 text-[14px] leading-5 text-text" data-testid="login-config-error">
          {s.configError}
        </p>
      )}
      {!s.canPrivy && !s.canDev && !s.configError && devKeyState !== "ok" && (
        <div className="rounded-[14px] bg-surface p-4 text-[14px] leading-5" data-testid="login-setup">
          <p className="font-semibold">Login isn&apos;t set up yet</p>
          <p className="mt-1 text-muted">
            Set <code className="font-mono text-[13px] text-text">NEXT_PUBLIC_PRIVY_APP_ID</code> in <code className="font-mono text-[13px] text-text">web/.env.local</code> and restart the web app.
          </p>
        </div>
      )}
      {devKeyState === "refused" && (
        <p className="text-[12px] leading-4 text-muted">
          NEXT_PUBLIC_DEV_KEY is ignored on chain {env.chainId}. Dev login only works on local anvil (31337).
        </p>
      )}
    </div>
  );
}

export function LoginSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address } = useSession();
  useEffect(() => {
    if (address && open) onOpenChange(false);
  }, [address, open, onOpenChange]);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Log in to musdy" hideTitle>
      <div className="flex flex-col items-center pt-4 pb-2 text-center sm:pt-0">
        <Image src="/brand/mark.svg" alt="" width={56} height={56} className="mb-5 size-14" />
        <p className="text-[24px] leading-[30px] font-medium tracking-[-0.02em]">Log in to musdy</p>
        <p className="mt-2 mb-6 max-w-[300px] text-[15px] leading-[21px] text-muted">One USD balance. Buy stocks, BTC and new coins, copy anyone, no gas.</p>
      </div>
      <LoginOptions />
    </Drawer>
  );
}

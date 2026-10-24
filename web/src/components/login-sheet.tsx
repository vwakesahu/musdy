"use client";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { devKeyState, env } from "@/lib/env";
import { Button } from "./ui/button";
import { Sheet } from "./ui/sheet";

export function LoginOptions() {
  const s = useSession();
  return (
    <div className="flex flex-col gap-3">
      {s.canPrivy && (
        <Button variant="accent" className="h-[52px] w-full" onClick={s.loginPrivy}>
          Continue with email, Google or Apple
        </Button>
      )}
      {s.canDev && (
        <Button variant="raised" className="h-[52px] w-full" onClick={s.loginDev} data-testid="dev-login">
          Dev login (local anvil)
        </Button>
      )}
      {!s.canPrivy && !s.canDev && (
        <div className="rounded-[20px] bg-raised p-4 text-[14px] leading-5" data-testid="login-setup">
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
    <Sheet open={open} onOpenChange={onOpenChange} title="Log in to musdy">
      <p className="mb-5 text-[14px] leading-5 text-muted">One USD balance. Buy anything, copy anyone, no gas.</p>
      <LoginOptions />
    </Sheet>
  );
}

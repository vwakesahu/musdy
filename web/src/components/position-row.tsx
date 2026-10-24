import Link from "next/link";
import type { Position } from "shared";
import { signedBig, tokenAmount, usd } from "@/lib/format";
import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { Change, Pnl } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";

export function PositionRow({ position }: { position: Position }) {
  const t = position.token;
  return (
    <Link
      href={`/token/${t.address}`}
      className="press flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-3 lg:mx-2 lg:rounded-[14px] lg:px-3"
      data-testid="position-row"
      data-token={t.address.toLowerCase()}
    >
      <TokenIcon token={t} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[16px] leading-5 font-medium">
          <span className="truncate">{t.name || t.symbol}</span>
          {!position.withdrawable && <LockSimpleIcon size={14} weight="fill" className="shrink-0 text-muted" aria-label="On its launch curve" />}
        </span>
        <span className="mt-1 block truncate text-[13px] leading-[17px] text-muted">
          {tokenAmount(BigInt(position.amount), t.decimals)} {t.symbol}
          <span className="hidden sm:inline">
            {" "}
            · cost <span data-testid="position-cost">{usd(BigInt(position.costMusd))}</span>
          </span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[16px] leading-5 font-medium tabular-nums" data-testid="position-value">
          {usd(BigInt(position.valueMusd))}
        </span>
        <span className="flex items-center gap-2">
          <Pnl value={signedBig(position.pnlMusd)} className="hidden text-[13px] leading-4 font-medium sm:inline" data-testid="position-pnl" />
          <Change value={position.pnlPct} />
        </span>
      </span>
    </Link>
  );
}

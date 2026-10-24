import Link from "next/link";
import type { Position } from "shared";
import { signedBig, tokenAmount, usd } from "@/lib/format";
import { Icon } from "./ui/icon";
import { PctChip, Pnl } from "./ui/pnl";
import { TokenIcon } from "./ui/token-icon";

export function PositionRow({ position }: { position: Position }) {
  const t = position.token;
  return (
    <Link href={`/token/${t.address}`} className="press flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-3" data-testid="position-row">
      <TokenIcon token={t} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] leading-[22px] font-semibold">
          {t.symbol}
          {!position.withdrawable && <Icon name="lock" size={14} className="text-muted" aria-label="On its launch curve" />}
        </span>
        <span className="block truncate text-[14px] leading-5 text-muted">
          {tokenAmount(BigInt(position.amount), t.decimals)} · cost {usd(BigInt(position.costMusd))}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="text-[15px] leading-[22px] font-medium tabular-nums">{usd(BigInt(position.valueMusd))}</span>
        <span className="flex items-center gap-1.5">
          <Pnl value={signedBig(position.pnlMusd)} className="text-[12px] font-medium" />
          <PctChip value={position.pnlPct} />
        </span>
      </span>
    </Link>
  );
}

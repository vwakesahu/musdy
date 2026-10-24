import { pct, signedUsd } from "@/lib/format";

const tone = (x: number) => (x > 0 ? "text-up" : x < 0 ? "text-down" : "text-muted");

export function PctChip({ value }: { value: number }) {
  const bg = value > 0 ? "bg-up/12" : value < 0 ? "bg-down/12" : "bg-raised";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-4 font-medium tabular-nums ${tone(value)} ${bg}`}>
      {value !== 0 && (
        <svg width="7" height="6" viewBox="0 0 7 6" aria-hidden className={value < 0 ? "rotate-180" : ""}>
          <path d="M3.5 0 7 6H0z" fill="currentColor" />
        </svg>
      )}
      {pct(value).replace(/^[+-]/, "")}
    </span>
  );
}

export function Pnl({ value, className = "" }: { value: bigint; className?: string }) {
  return <span className={`tabular-nums ${tone(value > 0n ? 1 : value < 0n ? -1 : 0)} ${className}`}>{signedUsd(value)}</span>;
}

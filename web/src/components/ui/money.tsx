import { usd } from "@/lib/format";

// "$163,293.86" with the cents at 60% and muted
export function Money({ value, className = "" }: { value: bigint; className?: string }) {
  const s = usd(value, true);
  const dot = s.lastIndexOf(".");
  return (
    <span className={`tabular-nums ${className}`}>
      {s.slice(0, dot)}
      <span className="text-[0.6em] text-muted">{s.slice(dot)}</span>
    </span>
  );
}

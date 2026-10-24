export function CurveBar({ progress }: { progress: number }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <span className="flex items-center gap-2" aria-label={`Launch curve ${Math.round(p * 100)}% filled`}>
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-raised">
        <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${p})` }} />
      </span>
      <span className="text-[12px] leading-4 font-medium text-muted tabular-nums">{Math.round(p * 100)}%</span>
    </span>
  );
}

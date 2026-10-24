export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton inline-block ${className}`} />;
}

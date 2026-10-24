/* eslint-disable @next/next/no-img-element */
export function TokenIcon({ token, size = 20 }: { token: { symbol: string; image: string | null }; size?: number }) {
  if (token.image) {
    return <img src={token.image} alt="" width={size} height={size} className="shrink-0 rounded-full bg-raised object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-raised font-semibold text-muted"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
    >
      {token.symbol.slice(0, size >= 40 ? 3 : 1).toUpperCase()}
    </span>
  );
}

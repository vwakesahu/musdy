import { formatUnits } from "viem";

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)]);

export const toNum = (x: bigint, decimals = 18) => Number(formatUnits(x, decimals));

export function compact(n: number, digits = 1) {
  const a = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of units) if (a >= v) return `${(n / v).toFixed(digits).replace(/\.0+$/, "")}${s}`;
  return n.toFixed(digits);
}

const dollars = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "$1,240.55", compact above 10,000 unless full is asked for
export function usd(x: bigint, full = false) {
  const n = Math.abs(toNum(x));
  const sign = x < 0n ? "-" : "";
  if (!full && n >= 10_000) return `${sign}$${compact(n)}`;
  return `${sign}$${dollars(n)}`;
}

export function signedUsd(x: bigint) {
  if (x === 0n) return "$0.00";
  return `${x > 0n ? "+" : ""}${usd(x)}`;
}

// prices under a cent get the subscript zero count, 0.0₅42
export function price(x: bigint) {
  if (x === 0n) return "$0.00";
  const n = toNum(x);
  if (n >= 1) return `$${dollars(n)}`;
  const frac = formatUnits(x, 18).split(".")[1] ?? "";
  const zeros = frac.length - frac.replace(/^0+/, "").length;
  if (n >= 0.01) return `$${Number(n.toPrecision(4))}`;
  const digits = frac.slice(zeros, zeros + 4).replace(/0+$/, "");
  return `$0.0${sub(zeros)}${digits}`;
}

// the same price text from a plain number, for the chart's scale
export const priceOfNumber = (n: number) => (Number.isFinite(n) && n > 0 ? price(BigInt(Math.round(n * 1e18))) : "$0.00");

export function tokenAmount(x: bigint, decimals = 18) {
  const n = toNum(x, decimals);
  if (n === 0) return "0";
  if (Math.abs(n) >= 10_000) return compact(n, 2);
  if (Math.abs(n) < 0.0001) return "<0.0001";
  return String(Number(n.toPrecision(4)));
}

export const pct = (fraction: number) => `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(2)}%`;

export function timeAgo(tsSec: number, nowMs: number) {
  const s = Math.max(0, Math.floor(nowMs / 1000 - tsSec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// a handle, else a short address. compact fits a 64px label, "0x90F…a1b"
export const displayName = (u: { address: string; handle: string | null }, compact = false) =>
  u.handle ?? (compact ? `${u.address.slice(0, 5)}…${u.address.slice(-3)}` : shortAddr(u.address));

// "12.50" -> 12.5e18, anything unparsable is zero
export function parseDollars(s: string): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m || (!m[1] && !m[2])) return 0n;
  const whole = BigInt(m[1] || "0");
  const frac = (m[2] ?? "").slice(0, 18).padEnd(18, "0");
  return whole * 10n ** 18n + BigInt(frac);
}

export const signedBig = (s: string) => {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
};

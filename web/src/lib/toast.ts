import type { TxRef } from "./explorer";
import { createStore } from "./store";

export type ToastKind = "info" | "pending" | "success" | "error";
export type Toast = { id: number; kind: ToastKind; text: string; tx?: TxRef; key?: string };
type Opts = { tx?: TxRef; key?: string; ms?: number };

let next = 1;
export const toasts = createStore<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

// a toast with the same key is replaced in place, so a pending tx toast turns into its outcome
export function toast(kind: ToastKind, text: string, opts: Opts | number = {}) {
  const o = typeof opts === "number" ? { ms: opts } : opts;
  const prev = o.key ? toasts.get().find((t) => t.key === o.key) : undefined;
  const id = prev?.id ?? next++;
  const item: Toast = { id, kind, text, tx: o.tx, key: o.key };
  toasts.set((list) => (prev ? list.map((t) => (t.id === id ? item : t)) : [...list.slice(-2), item]));
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (kind !== "error" && kind !== "pending") timers.set(id, setTimeout(() => dismissToast(id), o.ms ?? (o.tx ? 6000 : 4000)));
  return id;
}

export const dismissToast = (id: number) => {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.set((t) => t.filter((x) => x.id !== id));
};

const friendly: Record<string, string> = {
  faucet_limited: "You already claimed test MUSD today. The faucet allows one claim every 24 hours.",
  faucet_ip_limited: "This network already claimed the faucet 3 times today. Try again tomorrow.",
  faucet_busy: "The faucet is busy this hour. Try again in a bit.",
  faucet_off: "The faucet is off here.",
  handle_taken: "That handle is taken. Try another.",
  in_flight: "That's already on its way.",
  expired: "That took too long to send. Try again.",
  bad_nonce: "Another action was in flight. Try again.",
  curve_locked: "This coin is still on its launch curve and can't leave until it graduates.",
  self_follow: "You can't follow yourself.",
  network: "Can't reach the musdy server.",
  solver_off: "Trading this coin opens soon.",
  solver_low_musd: "The solver is low on MUSD right now. Your USDC stays in your wallet, try again later.",
  solver_no_gas: "Moving USDC from that chain isn't open right now. Your USDC stays in your wallet.",
  sell_no_gas: "Selling coins on this chain opens once the solver has gas there. Your coins are safe.",
  "solver low on MUSD": "The solver is low on MUSD right now. Your USDC stays in your wallet, try again later.",
  Expired: "That took too long to send. Try again.",
  BadNonce: "Another action was in flight. Try again.",
  BadSignature: "The signature didn't check out. Log in again and retry.",
  BadMetadata: "That name, ticker or image link is too long.",
  NoRoute: "There's no market for this coin right now.",
  AlreadyGraduated: "This coin moved to a Mezo pool. Try again.",
  Locked: "This coin is still on its launch curve.",
  ERC20InsufficientBalance: "Not enough balance for that.",
};

const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return "Something went wrong";
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
};

export function errorText(e: unknown): string {
  if (typeof e === "string") return friendly[e] ?? (/^[A-Z][A-Za-z0-9]+$/.test(e) ? sentence(e.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()) : sentence(e));
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string" && friendly[e.code]) return friendly[e.code];
  if (e instanceof Error) return friendly[e.message] ?? sentence(e.message);
  return "Something went wrong";
}

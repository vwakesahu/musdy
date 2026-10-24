import type { FeedItem, Position, TokenRef, TxStatus } from "shared";
import { createStore } from "./store";
import { keyOf } from "./xchain";

export type OptPos = { token: TokenRef; delta: bigint; musd: bigint; base: bigint };
export type Op = {
  txId: string;
  owner: string;
  status: TxStatus["status"];
  at: number;
  cashDelta: bigint;
  cashBase: bigint | null;
  pos?: OptPos;
  feed?: FeedItem;
};

export const ops = createStore<Op[]>([]);
const KEEP_CONFIRMED_MS = 20_000;

export function addOp(op: Omit<Op, "status" | "at">) {
  ops.set((list) => [...list.filter((o) => o.txId !== op.txId), { ...op, status: "pending", at: Date.now() }]);
}

export function settleOp(tx: Pick<TxStatus, "id" | "status">) {
  if (tx.status === "failed") return ops.set((list) => list.filter((o) => o.txId !== tx.id));
  if (tx.status !== "confirmed") return;
  ops.set((list) => list.map((o) => (o.txId === tx.id ? { ...o, status: "confirmed" as const } : o)));
  setTimeout(() => ops.set((list) => list.filter((o) => o.txId !== tx.id)), KEEP_CONFIRMED_MS);
}

const mine = (o: Op, owner: string | null | undefined) => !!owner && o.owner === owner.toLowerCase();

// a delta only applies while the server still reports the value it was based on, so a landed tx never counts twice
export function cashWith(list: Op[], owner: string | null | undefined, base: bigint) {
  let v = base;
  for (const o of list) if (mine(o, owner) && o.cashBase === base) v += o.cashDelta;
  return v < 0n ? 0n : v;
}

export type ShownPosition = Position & { filling: boolean };

export function positionsWith(list: Op[], owner: string | null | undefined, server: Position[]): ShownPosition[] {
  const out = new Map<string, ShownPosition>(server.map((p) => [keyOf(p.token), { ...p, filling: false }]));
  const serverHeld = new Map(server.map((p) => [keyOf(p.token), BigInt(p.amount)]));
  for (const o of list) {
    if (!mine(o, owner) || !o.pos) continue;
    const k = keyOf(o.pos.token);
    const cur = out.get(k);
    if ((serverHeld.get(k) ?? 0n) !== o.pos.base) continue;
    const held = cur ? BigInt(cur.amount) : 0n;
    const amount = held + o.pos.delta;
    const value = cur ? BigInt(cur.valueMusd) + o.pos.musd : o.pos.musd;
    if (cur) out.set(k, { ...cur, amount: (amount < 0n ? 0n : amount).toString(), valueMusd: (value < 0n ? 0n : value).toString(), filling: true });
    else if (amount > 0n)
      out.set(k, { token: o.pos.token, amount: amount.toString(), avgCostMusd: "0", valueMusd: o.pos.musd.toString(), costMusd: o.pos.musd.toString(), pnlMusd: "0", pnlPct: 0, withdrawable: true, filling: true });
  }
  return [...out.values()];
}

export const isPendingItem = (x: FeedItem) => x.id.startsWith("pending:");

export function feedWith(list: Op[], topic: string | null, items: FeedItem[], hashOf: (txId: string) => string | null): FeedItem[] {
  if (!topic || topic.startsWith("feed:following")) return items;
  const extra = list.filter((o) => {
    const f = o.feed;
    if (!f || o.status === "failed") return false;
    if (topic.startsWith("token:") && f.token.address.toLowerCase() !== topic.slice(6)) return false;
    if (topic.startsWith("user:") && o.owner !== topic.slice(5)) return false;
    const hash = hashOf(o.txId)?.toLowerCase();
    if (hash && items.some((x) => x.txHash.toLowerCase() === hash)) return false;
    return !(o.status === "confirmed" && items.some((x) => x.user.address.toLowerCase() === o.owner && keyOf(x.token) === keyOf(f.token) && x.isBuy === f.isBuy));
  });
  return extra.length ? [...extra.map((o) => o.feed as FeedItem).reverse(), ...items] : items;
}

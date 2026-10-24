import type { TxStatus } from "shared";
import type { TxRef } from "./explorer";
import { createStore } from "./store";

export type ActivityKind = TxStatus["kind"] | "copy" | "follow" | "handle" | "sweep";
export type Activity = { id: string; owner: string; kind: ActivityKind; title: string; done?: string; status: TxStatus["status"]; at: number; txId?: string; tx?: TxRef; error?: string | null };

const MAX = 40;
const storeKey = (owner: string) => `musdy:activity:${owner.toLowerCase()}`;
export const activity = createStore<Activity[]>([]);
let loadedFor: string | null = null;

export function loadActivity(owner: string | null) {
  const o = owner?.toLowerCase() ?? null;
  if (o === loadedFor) return;
  loadedFor = o;
  let list: Activity[] = [];
  try {
    if (o) list = JSON.parse(window.localStorage.getItem(storeKey(o)) ?? "[]") as Activity[];
  } catch {}
  activity.set(Array.isArray(list) ? list : []);
}

function save() {
  if (!loadedFor) return;
  try {
    window.localStorage.setItem(storeKey(loadedFor), JSON.stringify(activity.get().filter((a) => a.owner === loadedFor)));
  } catch {}
}

export function logActivity(a: Omit<Activity, "at" | "owner"> & { owner: string }) {
  const entry: Activity = { ...a, owner: a.owner.toLowerCase(), at: Date.now() };
  activity.set((list) => [entry, ...list.filter((x) => x.id !== a.id)].slice(0, MAX));
  save();
}

export function activityForTx(txId: string) {
  return activity.get().find((a) => a.txId === txId) ?? null;
}

export function updateActivity(txId: string, patch: Partial<Activity>) {
  let hit = false;
  activity.set((list) =>
    list.map((a) => {
      if (a.txId !== txId) return a;
      hit = true;
      return { ...a, ...patch };
    }),
  );
  if (hit) save();
  return hit;
}

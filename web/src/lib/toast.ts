import { createStore } from "./store";

export type Toast = { id: number; kind: "info" | "success" | "error"; text: string };

let next = 1;
export const toasts = createStore<Toast[]>([]);

export function toast(kind: Toast["kind"], text: string, ms = 4000) {
  const id = next++;
  toasts.set((t) => [...t.slice(-2), { id, kind, text }]);
  setTimeout(() => dismissToast(id), ms);
  return id;
}

export const dismissToast = (id: number) => toasts.set((t) => t.filter((x) => x.id !== id));

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

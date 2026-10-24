import { createStore } from "./store";

export type GlobalSheet = "login" | "deposit" | "withdraw" | null;
export const sheet = createStore<GlobalSheet>(null);
export const openSheet = (s: GlobalSheet) => sheet.set(s);

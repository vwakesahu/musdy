import { createStore } from "./store";

export type GlobalSheet = "login" | "deposit" | "withdraw" | null;
export const sheet = createStore<GlobalSheet>(null);
export const openSheet = (s: GlobalSheet) => sheet.set(s);

// open sheets are modal, so screen readers and tests only see toasts rendered inside the top sheet
export const openDialogs = createStore(0);

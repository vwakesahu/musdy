"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dismissToast, toasts, type Toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import { Icon } from "./ui/icon";

const none: Toast[] = [];

export function Toaster() {
  const list = useStore(toasts, (t) => t, none);
  const reduced = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex w-full max-w-[480px] flex-col gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            role={t.kind === "error" ? "alert" : "status"}
            data-toast={t.kind}
            initial={{ opacity: 0, y: reduced ? 0 : -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-start gap-3 rounded-[14px] border border-line bg-raised px-4 py-3 shadow-lg shadow-black/40"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === "error" ? "bg-text" : t.kind === "success" ? "bg-accent" : "bg-muted"}`} />
            <p className="flex-1 text-[14px] leading-5">{t.text}</p>
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-m-1 p-1 text-muted">
              <Icon name="close" size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dismissToast, toasts, type Toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import { openDialogs } from "@/lib/ui";
import { XIcon } from "@phosphor-icons/react";

const none: Toast[] = [];

// page toasts sit under the phone header (bottom right on desktop) so its buttons stay tappable; sheet toasts float above the sheet
export function Toaster({ inSheet = false }: { inSheet?: boolean }) {
  const list = useStore(toasts, (t) => t, none);
  const dialogs = useStore(openDialogs, (n) => n, 0);
  const reduced = useReducedMotion();
  if (!inSheet && dialogs > 0) return null;
  return (
    <div
      className={
        inSheet
          ? "pointer-events-none absolute inset-x-0 bottom-full z-[60] mb-2 flex flex-col gap-2 px-4"
          : "pointer-events-none fixed inset-x-0 top-[calc(52px+env(safe-area-inset-top))] z-[60] mx-auto flex w-full max-w-[480px] flex-col gap-2 px-4 pt-2 lg:top-auto lg:right-6 lg:bottom-6 lg:left-auto lg:mx-0 lg:w-[380px] lg:flex-col-reverse lg:px-0"
      }
    >
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
            className={`pointer-events-auto flex min-h-11 items-start gap-3 rounded-[22px] border px-4 py-2.5 shadow-panel ${t.kind === "error" ? "border-down/40 bg-down-soft" : "border-border-strong bg-surface"}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === "error" ? "bg-down" : t.kind === "success" ? "bg-up" : "bg-accent"}`} />
            <p className="flex-1 pt-px text-[14px] leading-5 font-medium">{t.text}</p>
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-my-3 -mr-3 grid h-11 w-11 shrink-0 place-items-center text-muted">
              <XIcon size={16} weight="bold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

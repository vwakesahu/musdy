"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dismissToast, toasts, type Toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import { openDialogs } from "@/lib/ui";
import { ArrowSquareOutIcon, CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { txUrl } from "@/lib/explorer";
import { Spinner } from "./ui/spinner";

function StatusIcon({ kind }: { kind: Toast["kind"] }) {
  if (kind === "pending") return <Spinner className="size-5 text-accent-hi" aria-label="In progress" />;
  if (kind === "success") return <CheckCircleIcon size={20} weight="fill" className="text-up" aria-hidden />;
  if (kind === "error") return <WarningCircleIcon size={20} weight="fill" className="text-down" aria-hidden />;
  return <InfoIcon size={20} weight="fill" className="text-accent-hi" aria-hidden />;
}

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
            aria-live={t.kind === "error" ? "assertive" : "polite"}
            initial={{ opacity: 0, y: reduced ? 0 : -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto flex min-h-11 items-start gap-2.5 rounded-[22px] border py-2.5 pr-1 pl-3 shadow-panel ${t.kind === "error" ? "border-down/40 bg-down-soft" : "border-border-strong bg-surface"}`}
          >
            <span className="grid h-5 shrink-0 place-items-center">
              <StatusIcon kind={t.kind} />
            </span>
            <p className="min-w-0 flex-1 text-[14px] leading-5 font-medium">{t.text}</p>
            <TxLink toast={t} />
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-my-2.5 grid h-10 w-10 shrink-0 cursor-pointer place-items-center text-muted hover:text-text">
              <XIcon size={16} weight="bold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function TxLink({ toast: t }: { toast: Toast }) {
  const url = t.tx ? txUrl(t.tx) : null;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-5 shrink-0 items-center gap-1 text-[14px] leading-5 font-semibold whitespace-nowrap text-accent hover:underline" data-testid="toast-tx">
      View tx <ArrowSquareOutIcon size={14} weight="bold" />
    </a>
  );
}

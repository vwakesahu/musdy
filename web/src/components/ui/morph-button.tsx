"use client";
import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";

export type MorphState = "idle" | "pending" | "success";

const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const RADIUS = 14;

type Props = Omit<ComponentProps<"button">, "children" | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd" | "style"> & {
  state: MorphState;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  doneLabel?: string;
};

// the button clips down to a centred circle (composited clip-path, no layout), spins, then draws a check
export function MorphButton({ state, variant = "primary", size = "lg", className, children, doneLabel = "Done", disabled, onClick, ...props }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const reduced = useReducedMotion();
  const morphed = state !== "idle";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const side = Math.max(0, (box.w - box.h) / 2);
  const clip = morphed ? `inset(0px ${side}px 0px ${side}px round ${box.h / 2}px)` : `inset(0px 0px 0px 0px round ${RADIUS}px)`;
  const t = reduced ? { duration: 0 } : { duration: 0.36, ease: EASE_OUT };

  return (
    <motion.button
      ref={ref}
      type="button"
      {...props}
      disabled={disabled}
      aria-disabled={morphed || undefined}
      aria-busy={state === "pending" || undefined}
      data-state={state}
      onClick={morphed ? undefined : onClick}
      initial={false}
      animate={{ clipPath: clip }}
      transition={t}
      className={cn(
        buttonVariants({ variant, size }),
        "transition-[background-color,color,filter] duration-200 motion-reduce:transition-none",
        morphed && "pointer-events-none shadow-none",
        state === "success" && "bg-up text-black",
        className,
      )}
    >
      <span className={cn("inline-flex items-center gap-2 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none", morphed && "scale-[0.96] opacity-0 motion-reduce:scale-100")}>{children}</span>
      <AnimatePresence initial={false}>
        {state === "pending" && (
          <motion.span
            key="spin"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reduced ? { duration: 0 } : { duration: 0.15, delay: 0.12 } }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
          >
            <Spinner className="size-6" />
          </motion.span>
        )}
        {state === "success" && (
          <motion.span key="check" className="absolute inset-0 grid place-items-center" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}>
            <svg viewBox="0 0 24 24" role="img" aria-label={doneLabel} className="size-7">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: reduced ? 0 : 1 }}
                animate={{ strokeDashoffset: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.32, ease: EASE_OUT, delay: 0.14 }}
              />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

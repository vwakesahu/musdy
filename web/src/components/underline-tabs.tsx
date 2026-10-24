"use client";
import { LayoutGroup, motion, useReducedMotion, type Transition } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const SLIDE: Transition = { type: "tween", duration: 0.2, ease: [0.23, 1, 0.32, 1] };
const INSTANT: Transition = { duration: 0 };

export function useTabTransition(): Transition {
  return useReducedMotion() ? INSTANT : SLIDE;
}

type Option<T> = { value: T; label: ReactNode };

export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
  right,
  label,
  className,
  tabClassName,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  right?: ReactNode;
  label?: string;
  className?: string;
  tabClassName?: string;
}) {
  const id = useId();
  const transition = useTabTransition();
  return (
    <div className={cn("flex items-stretch border-b border-border", className)}>
      <LayoutGroup id={id}>
        <div role="tablist" aria-label={label} className="flex flex-1">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(o.value)}
                className={cn(
                  "relative h-12 flex-1 cursor-pointer text-[16px] leading-5 font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-hi",
                  active ? "text-text" : "text-muted hover:text-text-2",
                  tabClassName,
                )}
              >
                {o.label}
                {active && (
                  <motion.span
                    layoutId="underline"
                    layoutDependency={value}
                    initial={false}
                    className="absolute inset-x-0 -bottom-px h-[3px] bg-accent-hi"
                    style={{ borderRadius: 3 }}
                    transition={transition}
                  />
                )}
              </button>
            );
          })}
        </div>
      </LayoutGroup>
      {right && <div className="flex items-center pr-2">{right}</div>}
    </div>
  );
}

export function RangeTabs<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label?: string }) {
  const id = useId();
  const transition = useTabTransition();
  return (
    <LayoutGroup id={id}>
      <div role="tablist" aria-label={label} className="flex items-center gap-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative h-8 cursor-pointer px-2.5 text-[14px] leading-[18px] font-medium tabular-nums transition-colors duration-200",
                active ? "text-text" : "text-muted hover:text-text-2",
              )}
            >
              {active && <motion.span layoutId="pill" initial={false} className="absolute inset-0 bg-surface-2" style={{ borderRadius: 8 }} transition={transition} />}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

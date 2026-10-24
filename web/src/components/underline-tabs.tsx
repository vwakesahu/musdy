"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
  right,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  right?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <div className={cn("flex items-stretch border-b border-border", className)}>
      <div role="tablist" className="flex flex-1">
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
                "relative h-12 flex-1 cursor-pointer text-[16px] leading-5 font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-hi",
                active ? "text-text" : "text-muted hover:text-text-2",
              )}
            >
              {o.label}
              {active && (
                <motion.span
                  layoutId={id}
                  className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-accent-hi"
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>
      {right && <div className="flex items-center pr-2">{right}</div>}
    </div>
  );
}

export function RangeTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex items-center gap-1">
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
              "h-8 cursor-pointer rounded-[8px] px-2.5 text-[14px] leading-[18px] font-medium tabular-nums transition-colors",
              active ? "bg-surface-2 text-text" : "text-muted hover:text-text-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

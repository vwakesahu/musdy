"use client";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { useTabTransition } from "../underline-tabs";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const transition = useTabTransition();
  return (
    <LayoutGroup id={id}>
    <div role="tablist" className={cn("flex rounded-md bg-surface-2 p-1", size === "sm" ? "text-[13px]" : "text-[15px]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn("press relative flex-1 rounded-[8px] font-medium transition-colors", size === "sm" ? "h-8 px-3" : "h-10 px-4", active ? "text-text" : "text-muted hover:text-text-2")}
          >
            {active && <motion.span layoutId="thumb" initial={false} className="absolute inset-0 border border-border-strong bg-surface-3" style={{ borderRadius: 8 }} transition={transition} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
    </LayoutGroup>
  );
}

"use client";
import { motion } from "motion/react";
import { useId } from "react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="tablist" className={`flex rounded-full bg-surface p-1 ${size === "sm" ? "text-[13px]" : "text-[14px]"}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 rounded-full font-medium transition-colors ${size === "sm" ? "h-11 px-2" : "h-11 px-4"} ${active ? "text-text" : "text-muted"}`}
          >
            {active && (
              <motion.span
                layoutId={id}
                className="absolute inset-0 rounded-full bg-raised"
                transition={{ duration: 0.24, ease: [0.65, 0, 0.35, 1] }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

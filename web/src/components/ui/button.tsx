import type { ButtonHTMLAttributes } from "react";

type Variant = "accent" | "sell" | "raised" | "outline" | "ghost";

const styles: Record<Variant, string> = {
  accent: "bg-accent text-on-accent active:bg-accent-pressed",
  sell: "bg-down text-bg",
  raised: "bg-raised text-text",
  outline: "border border-accent/60 text-accent",
  ghost: "text-muted",
};

export function Button({
  variant = "raised",
  className = "",
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`press inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-4 text-[15px] font-semibold disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}

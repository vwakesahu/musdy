"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold outline-none transition-[transform,background-color,filter,box-shadow] duration-120 ease-out active:scale-[0.97] active:duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hi disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 data-loading:text-transparent pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:min-h-11 pointer-coarse:after:-translate-y-1/2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5 motion-reduce:active:scale-100",
  {
    defaultVariants: { size: "md", variant: "secondary" },
    variants: {
      size: {
        lg: "h-14 px-6 text-[17px] leading-[22px]",
        md: "h-12 px-5 text-[16px] leading-5",
        sm: "h-9 gap-1.5 rounded-md px-3.5 text-[14px] leading-[18px] [&_svg:not([class*='size-'])]:size-4",
        icon: "size-11",
        "icon-sm": "size-9 rounded-md [&_svg:not([class*='size-'])]:size-4.5",
      },
      variant: {
        primary: "bg-accent text-on-accent shadow-glow hover:brightness-110 *:data-[slot=button-loading-indicator]:text-on-accent",
        buy: "bg-buy text-black hover:brightness-110 *:data-[slot=button-loading-indicator]:text-black",
        sell: "bg-down text-white hover:brightness-110 *:data-[slot=button-loading-indicator]:text-white",
        secondary: "bg-surface-2 text-text hover:bg-surface-3 *:data-[slot=button-loading-indicator]:text-text",
        ghost: "border border-border-strong bg-transparent text-text hover:bg-surface-3 *:data-[slot=button-loading-indicator]:text-text",
        white: "bg-white text-black hover:bg-white/90 *:data-[slot=button-loading-indicator]:text-black",
        destructive: "bg-down-soft text-down hover:brightness-125 *:data-[slot=button-loading-indicator]:text-down",
        link: "h-auto bg-transparent px-0 text-accent font-medium hover:underline underline-offset-4",
        bare: "bg-transparent text-text hover:bg-surface-3",
      },
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ className, variant, size, render, children, loading = false, disabled: disabledProp, ...props }: ButtonProps): React.ReactElement {
  const isDisabled = Boolean(loading || disabledProp);
  const defaultProps = {
    children: (
      <>
        {children}
        {loading && <Spinner className="pointer-events-none absolute size-5" data-slot="button-loading-indicator" />}
      </>
    ),
    className: cn(buttonVariants({ size, variant }), className),
    "aria-busy": loading || undefined,
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: render ? undefined : ("button" as const),
  };
  return useRender({ defaultTagName: "button", props: mergeProps<"button">(defaultProps, props), render });
}

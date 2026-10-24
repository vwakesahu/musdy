import { CircleNotchIcon } from "@phosphor-icons/react/ssr";
import type { IconProps } from "@phosphor-icons/react";
import type React from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className, ...props }: IconProps): React.ReactElement {
  return <CircleNotchIcon aria-label="Loading" weight="bold" className={cn("animate-spin", className)} role="status" {...props} />;
}

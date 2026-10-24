import type React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return <span aria-hidden className={cn("skeleton inline-block", className)} data-slot="skeleton" {...props} />;
}

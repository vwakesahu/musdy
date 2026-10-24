"use client";
import type { ReactNode } from "react";
import { Drawer as Vaul } from "vaul";
import { useDialogOpen } from "@/hooks/use-dialog-open";
import { useIsDesktop, useIsWide } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Toaster } from "../toaster";
import { Dialog, DialogPopup, DialogTitle } from "./dialog";
import { Sheet, SheetPopup, SheetTitle } from "./sheet";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  desktop?: "dialog" | "panel";
  className?: string;
  bodyClassName?: string;
  "data-testid"?: string;
  children: ReactNode;
};

const titleClass = (hide: boolean) => (hide ? "sr-only" : "px-4 pt-2 pb-1 text-center text-[17px] leading-[22px] font-medium sm:px-6 sm:pt-6 sm:text-left");

export function Drawer({ open, onOpenChange, title, hideTitle = false, desktop = "dialog", className, bodyClassName, children, ...rest }: DrawerProps) {
  useDialogOpen(open);
  const wide = useIsWide();
  const isDesktop = useIsDesktop();
  const body = <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6", hideTitle && "sm:pt-14", bodyClassName)}>{children}</div>;

  if (isDesktop && desktop === "panel") {
    return (
      <Sheet open={open} onOpenChange={(o) => onOpenChange(o)}>
        <SheetPopup side="right" className={cn("h-dvh w-[420px] border-border", className)} data-testid={rest["data-testid"]}>
          <div className="pointer-events-none absolute inset-x-0 bottom-6 h-0">{open && <Toaster inSheet />}</div>
          <SheetTitle className={titleClass(hideTitle)}>{title}</SheetTitle>
          {body}
        </SheetPopup>
      </Sheet>
    );
  }

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
        <DialogPopup bottomStickOnMobile={false} className={cn("max-h-[calc(100dvh-48px)] w-[440px]", className)} data-testid={rest["data-testid"]}>
          {open && <Toaster inSheet />}
          <DialogTitle className={titleClass(hideTitle)}>{title}</DialogTitle>
          {body}
        </DialogPopup>
      </Dialog>
    );
  }

  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Vaul.Content
          aria-describedby={undefined}
          data-testid={rest["data-testid"]}
          className={cn("fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] w-full flex-col rounded-t-2xl border-t border-border bg-bg-sheet outline-none", className)}
        >
          {open && <Toaster inSheet />}
          <div className="mx-auto mt-2 mb-2 h-1 w-9 shrink-0 rounded-[2px] bg-[#3a3945]" aria-hidden />
          <Vaul.Title className={titleClass(hideTitle)}>{title}</Vaul.Title>
          {body}
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

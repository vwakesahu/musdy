"use client";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { useDialogOpen } from "@/hooks/use-dialog-open";
import { Toaster } from "../toaster";

export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  useDialogOpen(open);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-[24px] border-t border-line bg-surface outline-none"
        >
          {open && <Toaster inSheet />}
          <div className="mx-auto mt-3 mb-1 h-1 w-9 shrink-0 rounded-full bg-line" aria-hidden />
          <Drawer.Title className={hideTitle ? "sr-only" : "px-4 pt-3 pb-1 text-[20px] leading-[26px] font-semibold"}>{title}</Drawer.Title>
          <div className="overflow-y-auto px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

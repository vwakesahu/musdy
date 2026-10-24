"use client";
import { useEffect } from "react";
import { openDialogs } from "@/lib/ui";

export function useDialogOpen(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openDialogs.set((n) => n + 1);
    return () => openDialogs.set((n) => n - 1);
  }, [open]);
}

"use client";
import { useState } from "react";
import { useActions } from "@/hooks/use-actions";
import { Button } from "./ui/button";
import { Sheet } from "./ui/sheet";

const HANDLE = /^[a-z0-9_]{3,15}$/;

export function HandleSheet({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: string | null }) {
  const actions = useActions();
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const ok = HANDLE.test(value) && value !== current;

  const save = async () => {
    setSaving(true);
    const res = await actions.setHandle(value);
    setSaving(false);
    if (res) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your name on musdy">
      <div className="flex flex-col gap-3">
        <label className="flex h-12 items-center rounded-[14px] bg-raised px-4">
          <span className="text-[16px] text-muted">@</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15))}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="handle"
            aria-label="Handle"
            className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
          />
        </label>
        <p className="text-[12px] leading-4 text-muted">3 to 15 characters: lowercase letters, numbers and underscores.</p>
        <Button variant="accent" className="h-[52px] w-full" disabled={!ok || saving} onClick={save} data-testid="save-handle">
          {saving ? "Saving" : "Save handle"}
        </Button>
      </div>
    </Sheet>
  );
}

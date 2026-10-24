import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-[15px] leading-[22px] font-medium">{title}</p>
      {body && <p className="max-w-[300px] text-[14px] leading-5 text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

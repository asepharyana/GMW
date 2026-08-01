"use client";

import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  clean:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  flagged: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  pending: "bg-muted text-muted-foreground border-border",
  processing:
    "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 animate-pulse",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

export function AiStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}

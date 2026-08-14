"use client";

import type { AiSeverity, AiStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const severityTick: Record<NonNullable<AiSeverity>, string> = {
  none: "border-[var(--color-signal)]/30",
  low: "border-[var(--color-amber)]/50",
  medium: "border-[var(--color-amber)]",
  high: "border-orange-500/80",
  critical: "border-[var(--color-vermilion)]",
};

const statusBadge: Record<NonNullable<AiStatus>, string> = {
  pending: "bg-[var(--color-ink-soft)]/20 text-[var(--color-ink-soft)]",
  processing: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
  clean: "bg-[var(--color-signal)]/15 text-[var(--color-signal)]",
  warn: "bg-[var(--color-amber)]/15 text-[var(--color-amber)]",
  flagged: "bg-[var(--color-vermilion)]/15 text-[var(--color-vermilion)]",
  error: "bg-[var(--color-vermilion)]/15 text-[var(--color-vermilion)]",
};

export function SeverityTick({ severity }: { severity?: AiSeverity | null }) {
  const cls = severity ? severityTick[severity] : "border-transparent";
  return (
    <span
      className={cn("absolute left-0 top-0 h-full w-0.5 border-l-2", cls)}
      aria-hidden="true"
    />
  );
}

export function AiStatusBadge({ status }: { status?: AiStatus | null }) {
  if (!status) return null;
  return (
    <span className={cn("pill", statusBadge[status])}>
      <span
        className="size-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      <span className="ml-1 text-[10px] font-medium uppercase">{status}</span>
    </span>
  );
}

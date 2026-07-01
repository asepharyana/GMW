/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN StatusBadge — Untuk AI status moderation (flagged/clean/error/dll)
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type StatusType =
  | "flagged"
  | "clean"
  | "warn"
  | "pending"
  | "processing"
  | "error"
  | "deleted"
  | "none";

const statusStyles: Record<StatusType, string> = {
  flagged: "bg-[#ffebee] text-[#e4405f] border-[#ffcdd2]",
  clean: "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]",
  warn: "bg-[#fef3c7] text-[#92400e] border-[#fde68a]",
  pending: "bg-[#f5f5f5] text-[#666666] border-[#e0e0e0]",
  processing: "bg-[#e1f0fd] text-[#0d4a7a] border-[#bce1fb]",
  error: "bg-[#ffebee] text-[#e4405f] border-[#ffcdd2]",
  deleted: "bg-[#f0f0f0] text-[#999999] border-[#e0e0e0] line-through",
  none: "bg-[#f5f5f5] text-[#666666] border-[#e0e0e0]",
};

interface StatusBadgeProps {
  status: StatusType | string | null;
  className?: string;
  children?: ReactNode;
}

export function StatusBadge({ status, className, children }: StatusBadgeProps) {
  const key = (status?.toLowerCase() ?? "none") as StatusType;
  const style = statusStyles[key] ?? statusStyles.none;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5",
        "font-sans text-xs font-medium leading-4 tracking-[0.03em]",
        style,
        className,
      )}
    >
      {children}
      {children ? " " : null}
      {status ?? "unknown"}
    </span>
  );
}

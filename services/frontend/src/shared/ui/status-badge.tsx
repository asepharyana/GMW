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
  flagged:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  clean:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  warn: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  pending: "bg-muted text-muted-foreground border-border",
  processing:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  error:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  deleted:
    "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800 line-through",
  none: "bg-muted text-muted-foreground border-border",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
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

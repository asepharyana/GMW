"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  clean:
    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  flagged: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  error: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20",
  pending: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  processing:
    "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
};

export function AiStatusBadge({ status }: { status?: string | null }) {
  const style = STATUS_STYLES[status ?? ""];
  if (!style) return null;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", style)}
    >
      {status}
    </Badge>
  );
}

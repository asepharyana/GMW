import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  description = "Nothing to display here yet.",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "surface flex flex-col items-center gap-2 py-12 text-center",
        className,
      )}
    >
      <Icon className="size-8 text-[var(--color-ink-soft)]" />
      <p className="text-sm font-medium text-[var(--color-ink)]">{title}</p>
      <p className="text-xs text-[var(--color-ink-soft)]">{description}</p>
    </div>
  );
}

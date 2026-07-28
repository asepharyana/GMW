"use client";

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { GlassPanel } from "@/components/glass/panel";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  description = "Nothing to display here yet.",
}: EmptyStateProps) {
  return (
    <GlassPanel dense className="flex flex-col items-center gap-2 py-12">
      <Icon className="size-8 text-text-secondary/20" />
      <p className="text-sm text-text-secondary/60">{title}</p>
      <p className="text-xs text-text-secondary/40">{description}</p>
    </GlassPanel>
  );
}

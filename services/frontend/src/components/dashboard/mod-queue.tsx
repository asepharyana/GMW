"use client";

import { AlertCircle, Check, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { cn } from "@/lib/utils";

interface ModQueueItem {
  id: string;
  content: string;
  username: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export function ModQueue({ items = [] }: { items?: ModQueueItem[] }) {
  const severityColor = {
    low: "text-accent-amber border-accent-amber/30",
    medium: "text-accent-purple border-accent-purple/30",
    high: "text-destructive border-destructive/40",
    critical: "text-destructive border-destructive/60 bg-destructive/10",
  };

  return (
    <GlassCard variant="base" className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-glass-border">
        <AlertCircle className="size-3.5 text-accent-purple" />
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Mod Queue
        </span>
        {items.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-accent-amber">
            {items.length} pending
          </span>
        )}
      </div>
      <div className="overflow-y-auto max-h-[320px] space-y-1 p-2">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-secondary/40 text-xs">
            No flagged messages
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "px-3 py-2 rounded-md border-l-2 text-sm space-y-1 hover:bg-glass-bg transition-colors",
                severityColor[item.severity],
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs text-text-primary">{item.username}</span>
                <span className="text-[10px] font-mono uppercase text-text-secondary/60">{item.severity}</span>
              </div>
              <p className="text-xs text-text-secondary line-clamp-1">{item.content}</p>
              <p className="text-[10px] text-text-secondary/50">{item.reason}</p>
              <div className="flex gap-1 pt-1">
                <button type="button" className="size-6 flex items-center justify-center rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-xs">
                  <Check className="size-3" />
                </button>
                <button type="button" className="size-6 flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}

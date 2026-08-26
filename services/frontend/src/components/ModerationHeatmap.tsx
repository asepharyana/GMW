"use client";

import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import type { HourlyModeration } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ModerationHeatmap({ hours }: { hours: HourlyModeration[] }) {
  const max = hours.reduce((m, h) => Math.max(m, h.total), 0);
  const intensity = (v: number) => {
    if (max <= 0) return "bg-hairline";
    const t = Math.max(0, Math.min(1, v / max));
    if (t < 0.25) return "bg-surface-2";
    if (t < 0.5) return "bg-signal/25";
    if (t < 0.75) return "bg-signal/50";
    return "bg-vermilion/60";
  };

  return (
    <GlassPanel className="lg:col-span-2">
      <SectionHeader eyebrow="timing" title="Flagged by Hour (24h)" />
      <p className="mb-3 text-xs text-ink-faint">
        Distribution of moderation actions across the day.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {hours.map((h) => (
          <div key={h.hour} className="flex items-center gap-2">
            <span className="w-8 text-xs text-ink-faint mono">
              {String(h.hour).padStart(2, "0")}:00
            </span>
            <div className="flex-1">
              <div
                className={cn(
                  "h-5 rounded transition-colors",
                  intensity(h.total),
                )}
                title={`${h.total} actions`}
              />
            </div>
            <span
              className={cn(
                "mono w-8 text-right text-xs",
                h.total === 0 ? "text-ink-faint/40" : "text-ink",
              )}
            >
              {h.total}
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

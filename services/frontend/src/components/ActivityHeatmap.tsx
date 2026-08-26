"use client";

import { useMemo } from "react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import type { MessageActivityBucket } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Neutral palette: dark slate → signal teal. No brand color for quiet data. */
function heatColor(t: number): string {
  if (t <= 0) return "var(--color-surface-2)";
  // 4 stops: subtle → medium → bright → full
  if (t < 0.25) return "rgba(45, 212, 191, 0.10)";
  if (t < 0.5) return "rgba(45, 212, 191, 0.25)";
  if (t < 0.75) return "rgba(45, 212, 191, 0.50)";
  return "rgba(45, 212, 191, 0.85)";
}

const HOUR_MARKS = [0, 4, 8, 12, 16, 20, 23];

export function ActivityHeatmap({
  buckets,
}: {
  buckets: MessageActivityBucket[];
}) {
  // Group by channel, normalise per-channel for better contrast.
  const { rows, globalMax } = useMemo(() => {
    const byKey = new Map<string, number>();
    const channelNames = new Map<string, string>();
    let gMax = 0;

    for (const b of buckets) {
      const k = `${b.channelId}:${b.hour}`;
      const next = (byKey.get(k) ?? 0) + b.count;
      byKey.set(k, next);
      channelNames.set(b.channelId, b.channelName);
      if (next > gMax) gMax = next;
    }

    const rows = Array.from(channelNames.entries())
      .map(([id, name]) => ({
        id,
        name,
        cells: HOURS.map((h) => byKey.get(`${id}:${h}`) ?? 0),
      }))
      // Sort by total descending so busiest channel is on top
      .sort((a, b) => {
        const sumA = a.cells.reduce((s, v) => s + v, 0);
        const sumB = b.cells.reduce((s, v) => s + v, 0);
        return sumB - sumA;
      });

    return { rows, globalMax: gMax };
  }, [buckets]);

  if (rows.length === 0) {
    return (
      <GlassPanel>
        <SectionHeader eyebrow="insight" title="Activity Heatmap" />
        <p className="py-6 text-center text-xs text-ink-faint">
          No message activity recorded yet.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="insight"
        title="Activity Heatmap"
        action={
          <span className="mono text-[10px] text-ink-faint">
            {rows.length} channels · {globalMax} peak msgs/hr
          </span>
        }
      />
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Column headers — hour labels */}
          <div className="mb-1 flex items-center gap-2">
            <span className="w-28 shrink-0" />
            <div className="flex flex-1 justify-between px-px">
              {HOUR_MARKS.map((h) => (
                <span
                  key={h}
                  className="mono text-[9px] text-ink-faint tabular-nums"
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <span
                  className="w-28 shrink-0 truncate text-[10px] text-ink-muted"
                  title={row.name}
                >
                  {row.name}
                </span>
                <div className="flex flex-1 gap-px">
                  {row.cells.map((count, h) => {
                    // Per-channel normalisation for better local contrast
                    const chMax = Math.max(...row.cells, 1);
                    const t = count / chMax;
                    return (
                      <div
                        key={h}
                        title={`${row.name} · ${String(h).padStart(2, "0")}:00 — ${count} msgs`}
                        className="h-5 flex-1 rounded-[2px] transition-colors hover:ring-1 hover:ring-signal/40"
                        style={{ background: heatColor(t) }}
                      />
                    );
                  })}
                </div>
                {/* Row total */}
                <span className="w-10 shrink-0 text-right font-mono text-[9px] text-ink-faint tabular-nums">
                  {row.cells.reduce((s, v) => s + v, 0)}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-2 flex items-center gap-2">
            <span className="w-28 shrink-0" />
            <div className="flex items-center gap-1.5 text-[9px] text-ink-faint">
              <span>Less</span>
              {[0, 0.15, 0.35, 0.6, 0.9].map((t) => (
                <div
                  key={t}
                  className="h-3 w-3 rounded-[2px]"
                  style={{ background: heatColor(t) }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

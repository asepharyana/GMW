"use client";

import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import type { MessageActivityBucket } from "@/lib/types";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function heatColor(t: number): string {
  // t in [0,1] → signal gradient (dark → bright).
  if (t <= 0) return "var(--color-hairline)";
  return `rgba(45, 212, 191, ${0.15 + 0.85 * t})`;
}

export function ActivityHeatmap({
  buckets,
}: {
  buckets: MessageActivityBucket[];
}) {
  // Group by channel, find max count for normalization.
  const channels = Array.from(new Set(buckets.map((b) => b.channelId)));
  const byKey = new Map<string, number>();
  let max = 0;
  for (const b of buckets) {
    const k = `${b.channelId}:${b.hour}`;
    byKey.set(k, (byKey.get(k) ?? 0) + b.count);
    if (byKey.get(k)! > max) max = byKey.get(k)!;
  }

  if (buckets.length === 0) {
    return (
      <GlassPanel className="lg:col-span-2">
        <SectionHeader eyebrow="insight" title="Activity Heatmap" />
        <p className="py-6 text-center text-xs text-ink-faint">
          No message activity recorded yet.
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="lg:col-span-5">
      <SectionHeader
        eyebrow="insight"
        title="Activity Heatmap"
        action={
          <span className="mono text-[0.65rem] text-ink-faint">
            {channels.length} channels · messages/hour
          </span>
        }
      />
      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-1">
          {channels.map((ch) => (
            <div key={ch} className="flex items-center gap-2">
              <span className="mono w-24 shrink-0 truncate text-[0.6rem] text-ink-faint">
                {ch.slice(-6)}
              </span>
              <div className="flex flex-1 gap-0.5">
                {HOURS.map((h) => {
                  const c = byKey.get(`${ch}:${h}`) ?? 0;
                  const t = max > 0 ? c / max : 0;
                  return (
                    <div
                      key={h}
                      title={`${ch} · ${String(h).padStart(2, "0")}:00 — ${c} msgs`}
                      className="h-4 flex-1 rounded-[2px]"
                      style={{ background: heatColor(t) }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <span className="w-24 shrink-0" />
            <div className="flex flex-1 justify-between">
              {[0, 6, 12, 18, 23].map((h) => (
                <span key={h} className="mono text-[0.55rem] text-ink-faint">
                  {String(h).padStart(2, "0")}h
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

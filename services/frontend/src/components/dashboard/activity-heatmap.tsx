"use client";

import { GlassCard } from "@/components/glass/card";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ActivityHeatmapProps {
  data?: Record<string, number>; // key: "day-hour", value: count
}

export function ActivityHeatmap({ data = {} }: ActivityHeatmapProps) {
  const maxVal = Math.max(...Object.values(data), 1);

  const getIntensity = (day: string, hour: number) => {
    const val = data[`${day}-${hour}`] || 0;
    const pct = val / maxVal;
    if (pct === 0) return "bg-surface";
    if (pct < 0.25) return "bg-primary/15";
    if (pct < 0.5) return "bg-primary/30";
    if (pct < 0.75) return "bg-primary/50";
    return "bg-primary/70";
  };

  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Activity</span>
        <span className="text-[10px] text-text-secondary/40">hour × day</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-[400px]">
          {/* Hour labels */}
          <div className="flex flex-col gap-0.5 mr-1">
            <div className="h-4" />
            {DAYS.map((d) => (
              <div key={d} className="h-3 flex items-center text-[8px] text-text-secondary/40 font-mono">{d}</div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex gap-0.5">
            {HOURS.map((hour) => (
              <div key={hour} className="flex flex-col gap-0.5">
                {DAYS.map((day) => (
                  <div
                    key={`${day}-${hour}`}
                    className={cn("size-3 rounded-sm transition-colors", getIntensity(day, hour))}
                    title={`${day} ${hour}:00 — ${data[`${day}-${hour}`] || 0}`}
                  />
                ))}
                <div className="h-3 flex items-center justify-center text-[8px] text-text-secondary/30 font-mono">
                  {hour % 4 === 0 ? hour : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

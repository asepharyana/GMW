"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { GlassCard } from "@/components/glass/card";
import { useMounted } from "@/lib/hooks/use-mounted";

interface ModerationDonutProps {
  data?: { name: string; value: number; color: string }[];
}

const TOOLTIP_STYLE = {
  background: "oklch(0.11 0.02 245 / 0.95)",
  border: "1px solid oklch(1 0 0 / 0.08)",
  borderRadius: 8,
  fontSize: 12,
  color: "oklch(0.93 0.01 245)",
} as const;

export function ModerationDonut({ data = [] }: ModerationDonutProps) {
  const mounted = useMounted();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cleanPct =
    total > 0
      ? Math.round(
          ((data.find((d) => d.name === "Clean")?.value ?? 0) / total) * 100,
        )
      : 0;

  return (
    <GlassCard variant="base">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Moderation Breakdown
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full animate-pulse rounded-full bg-card/40" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-text-primary">
              {total.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-text-secondary/60">
              messages
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: d.color }}
              />
              <span className="text-text-secondary">{d.name}</span>
              <span className="ml-auto font-mono text-text-primary">
                {d.value.toLocaleString()}
              </span>
              <span className="w-10 text-right font-mono text-text-secondary/50">
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
          {cleanPct >= 90 && (
            <p className="pt-1 text-[10px] text-green-500/80">
              ✓ Server is {cleanPct}% clean — moderation is holding up well
            </p>
          )}
          {cleanPct < 90 && cleanPct > 0 && (
            <p className="pt-1 text-[10px] text-amber-500/80">
              {100 - cleanPct}% of messages were flagged or warned — review
              activity in the Analysis tab
            </p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

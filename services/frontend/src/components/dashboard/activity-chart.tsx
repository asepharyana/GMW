"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/glass/card";
import { useMounted } from "@/lib/hooks/use-mounted";

interface ActivityChartProps {
  data?: { day: string; messages: number; flagged: number }[];
}

const TOOLTIP_STYLE = {
  background: "oklch(0.11 0.02 245 / 0.95)",
  border: "1px solid oklch(1 0 0 / 0.08)",
  borderRadius: 8,
  fontSize: 12,
  color: "oklch(0.93 0.01 245)",
} as const;

export function ActivityChart({ data = [] }: ActivityChartProps) {
  const mounted = useMounted();

  return (
    <GlassCard variant="base">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Message Activity
        </span>
        <span className="text-[10px] text-text-secondary/50">
          messages · flagged per day
        </span>
      </div>
      <div className="h-56">
        {mounted ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
          >
            <AreaChart data={data} margin={{ left: -18, right: 4, top: 4 }}>
              <defs>
                <linearGradient id="gradMessages" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient id="gradFlagged" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="oklch(0.62 0.19 25)"
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="100%"
                    stopColor="oklch(0.62 0.19 25)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(1 0 0 / 0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }}
                tickFormatter={(v: string) => {
                  const [, m, d] = v.split("-");
                  return `${Number(m)}/${Number(d)}`;
                }}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label) => {
                  const [y, m, d] = String(label).split("-");
                  return `${d}/${m}/${y}`;
                }}
              />
              <Area
                type="monotone"
                dataKey="messages"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#gradMessages)"
                name="Messages"
              />
              <Area
                type="monotone"
                dataKey="flagged"
                stroke="oklch(0.62 0.19 25)"
                strokeWidth={2}
                fill="url(#gradFlagged)"
                name="Flagged"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-md bg-card/40" />
        )}
      </div>
    </GlassCard>
  );
}

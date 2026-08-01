"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/glass/card";
import { useMounted } from "@/lib/hooks/use-mounted";

interface HourlyActivityChartProps {
  data?: { hour: number; messages: number; flagged: number }[];
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  return `${h}${i < 12 ? "am" : "pm"}`;
});

const TOOLTIP_STYLE = {
  background: "oklch(0.11 0.02 245 / 0.95)",
  border: "1px solid oklch(1 0 0 / 0.08)",
  borderRadius: 8,
  fontSize: 12,
  color: "oklch(0.93 0.01 245)",
} as const;

export function HourlyActivityChart({ data = [] }: HourlyActivityChartProps) {
  const mounted = useMounted();

  const full = Array.from({ length: 24 }, (_, hour) => {
    const found = data.find((d) => d.hour === hour);
    return {
      hour,
      label: HOUR_LABELS[hour],
      messages: found?.messages ?? 0,
      flagged: found?.flagged ?? 0,
    };
  });

  const peak = Math.max(1, ...full.map((d) => d.messages));
  const maxMessages = Math.max(...full.map((d) => d.messages));

  return (
    <GlassCard variant="base">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Hourly Activity
        </span>
        <span className="text-[10px] text-text-secondary/50">
          last 24h · peak {maxMessages} msgs
        </span>
      </div>
      <div className="h-40">
        {mounted ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
          >
            <BarChart data={full} margin={{ left: -22, right: 4, top: 4 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 9 }}
                interval={3}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(1, dataMax)]}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                labelFormatter={(label) => `Hour ${label}`}
              />
              <Bar dataKey="messages" radius={[3, 3, 0, 0]} name="Messages">
                {full.map((d) => (
                  <Cell
                    key={d.hour}
                    fill={
                      d.messages === maxMessages && maxMessages > 0
                        ? "var(--color-primary)"
                        : d.messages > peak * 0.5
                          ? "oklch(0.52 0.13 245 / 0.7)"
                          : "oklch(0.52 0.13 245 / 0.35)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-md bg-card/40" />
        )}
      </div>
    </GlassCard>
  );
}

"use client";

import { GlassCard } from "@/components/glass/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface MessageTrendChartProps {
  data?: { date: string; messages: number; flagged: number }[];
}

export function MessageTrendChart({ data = [] }: MessageTrendChartProps) {
  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">Message Trend</span>
        <span className="text-[10px] text-text-secondary/40">7 days</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="trend-msg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="trend-flag" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.11 0.02 245 / 0.9)",
                border: "1px solid oklch(1 0 0 / 0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "oklch(0.93 0.01 245)",
              }}
            />
            <Area type="monotone" dataKey="messages" stroke="var(--color-primary)" strokeWidth={2} fill="url(#trend-msg)" />
            <Area type="monotone" dataKey="flagged" stroke="var(--color-destructive)" strokeWidth={1.5} fill="url(#trend-flag)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

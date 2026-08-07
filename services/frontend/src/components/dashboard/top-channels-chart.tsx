"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

interface TopChannelsChartProps {
  data?: { name: string; count: number }[];
}

export function TopChannelsChart({ data = [] }: TopChannelsChartProps) {
  const mounted = useMounted();

  return (
    <Card className={cn("[--card-spacing:0px]", "rounded-2xl", "p-5")}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Top Channels
        </span>
      </div>
      <div className="h-48">
        {mounted ? (
          <ResponsiveContainer
            width="100%"
            height={192}
            minWidth={0}
            minHeight={0}
          >
            <BarChart data={data} layout="vertical">
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "oklch(0.55 0.02 245)", fontSize: 10 }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.11 0.02 245 / 0.9)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "oklch(0.93 0.01 245)",
                }}
              />
              <Bar
                dataKey="count"
                fill="var(--color-primary)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full animate-pulse rounded-md bg-card/40" />
        )}
      </div>
    </Card>
  );
}

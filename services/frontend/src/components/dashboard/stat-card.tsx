"use client";

import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { GlassCard } from "@/components/glass/card";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  variant?: "default" | "danger" | "success";
  sparklineData?: { value: number }[];
  formatter?: (v: number) => string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  sparklineData,
  formatter = (v) => (typeof v === "number" ? v.toLocaleString() : v),
}: StatCardProps) {
  const mounted = useMounted();
  const accentColor = {
    default: "var(--color-primary)",
    danger: "var(--color-destructive)",
    success: "oklch(0.6 0.18 160)",
  }[variant];

  const bgAccent = {
    default: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-emerald-500/10 text-emerald-500",
  }[variant];

  const numValue = typeof value === "number" ? value : Number(value);

  return (
    <GlassCard variant="base" className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={cn("p-1.5 rounded-md", bgAccent)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div
        className="text-2xl font-mono font-semibold tracking-tight"
        style={{ color: accentColor }}
      >
        {formatter(numValue)}
      </div>
      <div className="text-[11px] text-text-secondary font-medium mt-0.5 tracking-wide uppercase">
        {label}
      </div>

      {/* Sparkline background */}
      {sparklineData && sparklineData.length > 0 && mounted && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-20">
          <ResponsiveContainer
            width="100%"
            height={48}
            minWidth={0}
            minHeight={0}
          >
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient
                  id={`spark-grad-${label}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#spark-grad-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

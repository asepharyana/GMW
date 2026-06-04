import { useState } from "react";
import type { AIStats } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

interface AIDistributionPanelProps {
  stats: AIStats | null;
  loading: boolean;
}

const SEVERITY_META: Record<
  string,
  { label: string; color: string; darkColor: string }
> = {
  critical: {
    label: "Critical",
    color: "#e11d48",
    darkColor: "#be123c",
  },
  high: {
    label: "High",
    color: "#f43f5e",
    darkColor: "#e11d48",
  },
  medium: {
    label: "Medium",
    color: "#fb923c",
    darkColor: "#f97316",
  },
  low: {
    label: "Low",
    color: "#facc15",
    darkColor: "#eab308",
  },
  none: {
    label: "None",
    color: "#94a3b8",
    darkColor: "#64748b",
  },
};

const ACTION_META: Record<
  string,
  { label: string; color: string }
> = {
  escalate: { label: "Escalate", color: "#e11d48" },
  delete: { label: "Delete", color: "#f43f5e" },
  review: { label: "Review", color: "#fb923c" },
  warn: { label: "Warn", color: "#facc15" },
  monitor: { label: "Monitor", color: "#38bdf8" },
  none: { label: "None", color: "#94a3b8" },
};

function DonutChart({
  entries,
  size = 140,
  strokeWidth = 22,
}: {
  entries: Array<{ key: string; value: number; color: string; label: string }>;
  size?: number;
  strokeWidth?: number;
}) {
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-[11px] text-muted-foreground">
        No data
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;
  const segments = entries
    .filter((e) => e.value > 0)
    .map((e) => {
      const offset = cumulative;
      const length = (e.value / total) * circumference;
      cumulative += length;
      return { ...e, length, offset };
    });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.2}
        />
        {/* Segments */}
        {segments.map((seg) => {
          const isHovered = hoveredKey === seg.key;
          return (
            <circle
              key={seg.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round"
              className={cn(
                "transition-all duration-200",
                hoveredKey && !isHovered ? "opacity-30" : "opacity-100",
              )}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                filter: isHovered ? `drop-shadow(0 0 4px ${seg.color}80)` : undefined,
              }}
            />
          );
        })}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold tabular-nums leading-none">
          {total}
        </span>
        <span className="text-[9px] text-muted-foreground mt-0.5">Total</span>
      </div>

      {/* Hover tooltip */}
      {hoveredKey && (() => {
        const entry = entries.find((e) => e.key === hoveredKey);
        if (!entry) return null;
        const pct = ((entry.value / total) * 100).toFixed(0);
        return (
          <div
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-muted bg-white px-2.5 py-1 text-xs shadow-lg z-10"
          >
            <span className="font-medium">{entry.label}</span>:{" "}
            <span className="tabular-nums">{entry.value}</span> ({pct}%)
          </div>
        );
      })()}
    </div>
  );
}

function HorizontalBarChart({
  entries,
  maxValue,
}: {
  entries: Array<{ key: string; value: number; color: string; label: string }>;
  maxValue: number;
}) {
  const effectiveMax = Math.max(maxValue, 1);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      {entries.map((e) => {
        const isHovered = hoveredKey === e.key;
        const widthPct = (e.value / effectiveMax) * 100;
        return (
          <div
            key={e.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHoveredKey(e.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            <span className="w-16 text-[10px] font-medium text-right truncate text-muted-foreground">
              {e.label}
            </span>
            <div className="flex-1 h-3 overflow-hidden rounded-md bg-muted/30">
              <div
                className={cn(
                  "h-full rounded-md transition-all duration-300",
                  isHovered ? "opacity-100" : "opacity-80",
                )}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: e.color,
                }}
              />
            </div>
            <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {e.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AIDistributionPanel({
  stats,
  loading,
}: AIDistributionPanelProps) {
  if (loading && !stats) return <LoadingBox />;

  if (!stats || stats.total_analyzed === 0) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada data analisis AI.
        </CardContent>
      </Card>
    );
  }

  const severityEntries = Object.entries(stats.severity)
    .map(([key, value]) => {
      const m = SEVERITY_META[key] ?? {
        label: key,
        color: "#94a3b8",
        darkColor: "#64748b",
      };
      return { key, value, color: m.color, label: m.label };
    })
    .filter((e) => e.value > 0);

  const actionEntries = Object.entries(stats.recommended_actions)
    .map(([key, value]) => {
      const m = ACTION_META[key] ?? {
        label: key,
        color: "#94a3b8",
      };
      return { key, value, color: m.color, label: m.label };
    })
    .filter((e) => e.value > 0);

  const maxAction = Math.max(
    ...actionEntries.map((e) => e.value),
    1,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">🤖</span>
          Distribusi Analisis AI
        </CardTitle>
        <CardDescription className="text-xs">
          Sebaran tingkat keparahan dan rekomendasi dari{" "}
          {stats.total_analyzed} pesan yang dianalisis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Severity Donut */}
          <div className="flex flex-col items-center gap-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground self-start">
              Severity
            </h4>
            <DonutChart entries={severityEntries} />
            {/* Severity legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {severityEntries.map((e) => (
                <span
                  key={e.key}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: e.color }}
                  />
                  {e.label}:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {e.value}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Recommended Actions Bar Chart */}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rekomendasi Tindakan
            </h4>
            <HorizontalBarChart
              entries={actionEntries}
              maxValue={maxAction}
            />
          </div>
        </div>

        {/* Footer metrics */}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-muted pt-3 text-[10px] text-muted-foreground">
          <span>
            Rerata confidence:{" "}
            <strong>{(stats.avg_confidence * 100).toFixed(0)}%</strong>
          </span>
          <span>
            Rerata score:{" "}
            <strong>{(stats.avg_score * 100).toFixed(0)}%</strong>
          </span>
          <span>
            Error:{" "}
            <strong className="text-destructive">
              {stats.analysis_errors}
            </strong>
          </span>
          <span>
            Pending:{" "}
            <strong className="text-orange-500">
              {stats.analysis_pending}
            </strong>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card>
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-sm border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}

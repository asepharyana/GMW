import { useState } from "react";
import type { TrendBucket } from "../../../shared/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";
import { cn } from "../../../shared/lib/utils";

interface TrendChartProps {
  trend: TrendBucket[];
  loading: boolean;
}

const LINE_COLORS: Array<{
  key: keyof Omit<TrendBucket, "date">;
  color: string;
  label: string;
  dash?: string;
}> = [
  { key: "count", color: "#38bdf8", label: "Total" },
  { key: "clean", color: "#34d399", label: "Clean" },
  { key: "flagged", color: "#f472b6", label: "Flagged" },
  { key: "warned", color: "#facc15", label: "Warned" },
  { key: "error", color: "#fb923c", label: "Error", dash: "4 3" },
];

export function TrendChart({ trend, loading }: TrendChartProps) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    values: Array<{ key: string; label: string; value: number; color: string }>;
  } | null>(null);

  if (loading && !trend?.length) return <LoadingBox />;
  if (!trend?.length) return null;

  const CHART_HEIGHT = 200;
  const CHART_PADDING = { top: 10, right: 16, bottom: 30, left: 40 };
  const chartW = Math.max((trend.length - 1) * 64, 200);
  const plotW = chartW - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const allValues = trend.flatMap((d) =>
    LINE_COLORS.map((l) => Number(d[l.key] ?? 0)),
  );
  const maxValue = Math.max(...allValues, 1);

  function getX(index: number): number {
    if (trend.length <= 1) return CHART_PADDING.left;
    return (
      CHART_PADDING.left +
      (index / (trend.length - 1)) * plotW
    );
  }

  function getY(value: number): number {
    return CHART_PADDING.top + plotH - (value / maxValue) * plotH;
  }

  function buildLinePath(
    data: TrendBucket[],
    key: keyof Omit<TrendBucket, "date">,
  ): string {
    const points = data.map((d, i) => ({
      x: getX(i),
      y: getY(Number(d[key] ?? 0)),
    }));
    if (points.length === 0) return "";

    const segments: string[] = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      segments.push(`Q ${cx} ${prev.y} ${curr.x} ${curr.y}`);
    }
    return segments.join(" ");
  }

  function buildAreaPath(
    data: TrendBucket[],
    key: keyof Omit<TrendBucket, "date">,
  ): string {
    const line = buildLinePath(data, key);
    if (!line) return "";
    const first = getX(0);
    const last = getX(data.length - 1);
    const bottom = CHART_PADDING.top + plotH;
    return `${line} L ${last} ${bottom} L ${first} ${bottom} Z`;
  }

  const totalMessages = trend.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="col-span-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Tren Harian</CardTitle>
        <CardDescription className="text-xs">
          Volume pesan per hari — arahkan kursor ke titik untuk detail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-4 text-[11px]">
          {LINE_COLORS.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <svg width="14" height="3" className="overflow-visible">
                <line
                  x1="0"
                  y1="1.5"
                  x2="14"
                  y2="1.5"
                  stroke={l.color}
                  strokeWidth={2}
                  strokeDasharray={l.dash ?? "none"}
                  strokeLinecap="round"
                />
              </svg>
              {l.label}
            </span>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-muted/50 bg-white/60 p-4">
          <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Rangkuman{" "}
              {trend.length > 1
                ? `${trend.length} hari terakhir`
                : "hari ini"}
            </span>
            <span className="font-medium tabular-nums">
              {totalMessages} total pesan
            </span>
          </div>

          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartW} ${CHART_HEIGHT}`}
              className="w-full"
              style={{ height: CHART_HEIGHT }}
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = getY(ratio * maxValue);
                return (
                  <g key={ratio}>
                    <line
                      x1={CHART_PADDING.left}
                      y1={y}
                      x2={chartW - CHART_PADDING.right}
                      y2={y}
                      stroke="hsl(var(--muted))"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <text
                      x={CHART_PADDING.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-muted-foreground"
                      fontSize={9}
                    >
                      {Math.round(ratio * maxValue)}
                    </text>
                  </g>
                );
              })}

              {/* Area fills */}
              {LINE_COLORS.filter((l) => l.key === "count" || l.key === "flagged").map((l) => (
                <path
                  key={`area-${l.key}`}
                  d={buildAreaPath(trend, l.key)}
                  fill={l.color}
                  opacity={0.07}
                />
              ))}

              {/* Lines */}
              {LINE_COLORS.map((l) => (
                <path
                  key={`line-${l.key}`}
                  d={buildLinePath(trend, l.key)}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={l.key === "count" ? 2.5 : 1.5}
                  strokeDasharray={l.dash ?? "none"}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="transition-opacity"
                />
              ))}

              {/* Interactive dots */}
              {trend.map((d, i) => {
                const x = getX(i);
                const y = getY(d.count);
                const isActive = tooltip?.date === d.date;
                return (
                  <g key={d.date}>
                    {/* Invisible hit area */}
                    <rect
                      x={x - 28}
                      y={CHART_PADDING.top}
                      width={56}
                      height={plotH}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => {
                        setTooltip({
                          date: d.date,
                          values: LINE_COLORS.map((l) => ({
                            key: l.key,
                            label: l.label,
                            value: Number(d[l.key] ?? 0),
                            color: l.color,
                          })),
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    {/* Dot */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isActive ? 5 : 2.5}
                      fill={isActive ? "#38bdf8" : "#38bdf8"}
                      stroke="white"
                      strokeWidth={isActive ? 2 : 0}
                      className={cn(
                        "transition-all",
                        isActive ? "opacity-100" : "opacity-70",
                      )}
                    />
                    {/* Date label */}
                    <text
                      x={x}
                      y={CHART_PADDING.top + plotH + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      fontSize={9}
                    >
                      {d.date.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border border-muted bg-white px-3 py-2 text-xs shadow-lg"
                style={{
                  top: `${CHART_PADDING.top + 4}px`,
                  left: `${getX(trend.findIndex((d) => d.date === tooltip.date)) + 12}px`,
                }}
              >
                <div className="mb-1 font-semibold text-foreground">
                  {tooltip.date}
                </div>
                {tooltip.values
                  .filter((v) => v.value > 0)
                  .map((v) => (
                    <div
                      key={v.key}
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <svg width="8" height="8">
                        <circle
                          cx="4"
                          cy="4"
                          r="3"
                          fill={v.color}
                        />
                      </svg>
                      <span>{v.label}</span>
                      <span className="ml-6 font-medium tabular-nums text-foreground">
                        {v.value}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card className="col-span-3">
      <CardContent className="flex h-65 items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-sm border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}

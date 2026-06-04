import { useState } from "react";
import type { HourlyBucket } from "../../../shared/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";
import { cn } from "../../../shared/lib/utils";

interface ActivityChartProps {
  hourly: HourlyBucket[];
  loading: boolean;
}

const COLORS = {
  clean: { fill: "#38bdf8", label: "Clean" },
  warned: { fill: "#facc15", label: "Warned" },
  flagged: { fill: "#f472b6", label: "Flagged" },
  error: { fill: "#fb923c", label: "Error" },
} as const;

type BarKey = keyof typeof COLORS;

export function ActivityChart({ hourly, loading }: ActivityChartProps) {
  const [tooltip, setTooltip] = useState<{
    hour: string;
    total: number;
  } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  if (loading && !hourly?.length) return <LoadingBox />;
  if (!hourly?.length) return <EmptyBox text="Belum ada data untuk periode ini." />;

  const data = hourly.map((b) => {
    const utcHour = parseInt(b.hour.slice(11, 13), 10);
    const jakartaHour = (utcHour + 7) % 24;
    return {
      hour: `${String(jakartaHour).padStart(2, "0")}:00`,
      clean: b.clean,
      warned: b.warned,
      flagged: b.flagged,
      error: b.error,
      total: b.count,
    };
  });

  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  // Only show every Nth label to avoid crowding
  const labelInterval = data.length > 16 ? 2 : 1;

  const bars: Array<{ key: BarKey; color: string; label: string }> = [
    { key: "clean", color: COLORS.clean.fill, label: COLORS.clean.label },
    { key: "warned", color: COLORS.warned.fill, label: COLORS.warned.label },
    { key: "flagged", color: COLORS.flagged.fill, label: COLORS.flagged.label },
    { key: "error", color: COLORS.error.fill, label: COLORS.error.label },
  ];

  const CHART_HEIGHT = 200;
  const BAR_GROUP_WIDTH = 28;
  const BAR_WIDTH = 5;
  const GAP = 2;

  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">
              Aktivitas per Jam
            </CardTitle>
            <CardDescription className="text-xs">
              Distribusi pesan per jam — arahkan kursor ke bar untuk detail.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-4 text-[11px]">
          {bars.map((b) => (
            <span key={b.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div className="relative overflow-x-auto">
          <div className="min-w-[560px]">
            <svg
              viewBox={`0 0 ${Math.max(data.length * BAR_GROUP_WIDTH + 40, 200)} ${CHART_HEIGHT + 40}`}
              className="w-full"
              style={{ height: CHART_HEIGHT + 40 }}
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = CHART_HEIGHT - ratio * (CHART_HEIGHT - 20) - 20;
                return (
                  <g key={ratio}>
                    <line
                      x1={30}
                      y1={y}
                      x2={data.length * BAR_GROUP_WIDTH + 10}
                      y2={y}
                      stroke="hsl(var(--muted))"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <text
                      x={28}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-muted-foreground"
                      fontSize={9}
                    >
                      {Math.round(ratio * maxTotal)}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {data.map((d, i) => {
                const x = i * BAR_GROUP_WIDTH + 32;
                let accumulated = 0;

                return (
                  <g key={d.hour}>
                    {/* Hover target (invisible wider rect) */}
                    <rect
                      x={x - 4}
                      y={0}
                      width={BAR_GROUP_WIDTH}
                      height={CHART_HEIGHT}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => {
                        setTooltip({ hour: d.hour, total: d.total });
                        setHoveredBar(d.hour);
                      }}
                      onMouseLeave={() => {
                        setTooltip(null);
                        setHoveredBar(null);
                      }}
                    />

                    {/* Stacked bars */}
                    {bars.map((bar) => {
                      const val = d[bar.key];
                      const barH = (val / maxTotal) * (CHART_HEIGHT - 20);
                      const y = CHART_HEIGHT - accumulated - barH - 20;
                      accumulated += barH;
                      return val > 0 ? (
                        <rect
                          key={bar.key}
                          x={x + GAP}
                          y={y}
                          width={BAR_WIDTH}
                          height={Math.max(barH, 1)}
                          fill={bar.color}
                          rx={1.5}
                          className={cn(
                            "transition-opacity",
                            hoveredBar === d.hour
                              ? "opacity-100"
                              : hoveredBar
                                ? "opacity-40"
                                : "opacity-90",
                          )}
                        />
                      ) : null;
                    })}

                    {/* X-axis label */}
                    {i % labelInterval === 0 && (
                      <text
                        x={x + BAR_WIDTH / 2 + GAP}
                        y={CHART_HEIGHT - 2}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={9}
                      >
                        {d.hour}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute top-0 z-10 rounded-lg border border-muted bg-white px-3 py-2 text-xs shadow-lg"
                style={{
                  left: `${data.findIndex((d) => d.hour === tooltip.hour) * BAR_GROUP_WIDTH + 36}px`,
                }}
              >
                <div className="mb-1 font-semibold text-foreground">
                  {tooltip.hour}
                </div>
                {bars.map((b) => {
                  const d = data.find((d) => d.hour === tooltip.hour);
                  const val = d?.[b.key] ?? 0;
                  return val > 0 ? (
                    <div key={b.key} className="flex items-center gap-2 text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ backgroundColor: b.color }}
                      />
                      <span>{b.label}</span>
                      <span className="ml-auto font-medium tabular-nums text-foreground">
                        {val}
                      </span>
                    </div>
                  ) : null;
                })}
                <div className="mt-1 flex items-center gap-2 border-t border-muted pt-1 text-muted-foreground">
                  <span>Total</span>
                  <span className="ml-auto font-bold tabular-nums text-foreground">
                    {tooltip.total}
                  </span>
                </div>
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
    <Card className="col-span-1 flex h-65 items-center justify-center text-sm text-muted-foreground lg:col-span-2">
      <span className="h-4 w-4 animate-spin rounded-sm border-2 border-primary border-t-transparent" />
      <span className="ml-2">Memuat data...</span>
    </Card>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <Card className="col-span-1 flex h-65 items-center justify-center text-sm text-muted-foreground lg:col-span-2">
      {text}
    </Card>
  );
}

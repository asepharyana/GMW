import { useMemo, useState } from "react";
import type { HeatmapCell } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

interface HeatmapProps {
  cells: HeatmapCell[];
  loading: boolean;
}

export function Heatmap({ cells, loading }: HeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    day: string;
    hour: string;
    total: number;
    clean: number;
    warned: number;
    flagged: number;
  } | null>(null);

  const maxCount = useMemo(
    () => Math.max(1, ...cells.map((c) => c.count)),
    [cells],
  );

  if (loading && !cells?.length) return <LoadingBox />;
  if (!cells?.length) return <EmptyBox />;

  const cellMap = new Map<string, HeatmapCell>();
  for (const c of cells) cellMap.set(`${c.dayOfWeek}-${c.hour}`, c);

  function getIntensity(day: number, hour: number): number {
    return (cellMap.get(`${day}-${hour}`)?.count ?? 0) / maxCount;
  }

  function getHeatClass(intensity: number): string {
    if (intensity === 0) return "bg-muted/20";
    if (intensity < 0.1) return "bg-primary/15";
    if (intensity < 0.2) return "bg-primary/25";
    if (intensity < 0.35) return "bg-primary/40";
    if (intensity < 0.5) return "bg-primary/55";
    if (intensity < 0.7) return "bg-primary/70";
    return "bg-primary/85";
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Heatmap Aktivitas
        </CardTitle>
        <CardDescription className="text-xs">
          Hari × jam — arahkan kursor ke sel untuk detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Header row */}
            <div className="mb-1 flex gap-[3px] pl-8">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums"
                >
                  {h % 3 === 0 ? `${h}` : ""}
                </div>
              ))}
            </div>
            {/* Rows */}
            {DAYS.map((dayLabel, d) => (
              <div key={d} className="mb-[3px] flex items-center gap-[3px]">
                <div className="w-8 shrink-0 text-right pr-1 text-[10px] text-muted-foreground">
                  {dayLabel}
                </div>
                {Array.from({ length: 24 }, (_, h) => {
                  const intensity = getIntensity(d, h);
                  const cell = cellMap.get(`${d}-${h}`);
                  const count = cell?.count ?? 0;
                  return (
                    <div
                      key={h}
                      className={cn(
                        "flex-1 rounded-md aspect-square border border-muted/30 transition-all duration-150",
                        getHeatClass(intensity),
                        count > 0
                          ? "cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-110"
                          : "",
                      )}
                      onMouseEnter={() => {
                        if (count > 0) {
                          setTooltip({
                            day: dayLabel,
                            hour: `${h}:00`,
                            total: count,
                            clean: cell?.clean ?? 0,
                            warned: cell?.warned ?? 0,
                            flagged: cell?.flagged ?? 0,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-muted bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: "50%",
              top: "100%",
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-1 font-semibold text-foreground">
              {tooltip.day} {tooltip.hour}
            </div>
            <div className="space-y-0.5 text-muted-foreground">
              <div className="flex items-center justify-between gap-4">
                <span>Total</span>
                <span className="font-medium tabular-nums text-foreground">
                  {tooltip.total}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-primary">Clean</span>
                <span className="tabular-nums">{tooltip.clean}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-yellow-600">Warned</span>
                <span className="tabular-nums">{tooltip.warned}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-accent">Flagged</span>
                <span className="tabular-nums">{tooltip.flagged}</span>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Sepi</span>
          <span className="inline-block h-3 w-3 rounded-sm bg-muted/20" />
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/15" />
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/40" />
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/70" />
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/85" />
          <span>Ramai</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card className="col-span-2">
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-sm border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}

function EmptyBox() {
  return (
    <Card className="col-span-2">
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Belum ada data heatmap.
      </CardContent>
    </Card>
  );
}

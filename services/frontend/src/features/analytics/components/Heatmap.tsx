import { useMemo } from "react";
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
  const maxCount = useMemo(
    () => Math.max(1, ...cells.map((c) => c.count)),
    [cells],
  );

  if (loading && !cells?.length) {
    return <LoadingBox />;
  }

  if (!cells?.length) {
    return <EmptyBox />;
  }

  const cellMap = new Map<string, HeatmapCell>();
  for (const c of cells) cellMap.set(`${c.dayOfWeek}-${c.hour}`, c);

  function getIntensity(day: number, hour: number): number {
    return (cellMap.get(`${day}-${hour}`)?.count ?? 0) / maxCount;
  }

  function getHeatClass(intensity: number): string {
    if (intensity === 0) return "bg-sky-50";
    if (intensity < 0.1) return "bg-sky-200/30";
    if (intensity < 0.2) return "bg-sky-300/30";
    if (intensity < 0.35) return "bg-sky-400/35";
    if (intensity < 0.5) return "bg-sky-400/55";
    if (intensity < 0.7) return "bg-primary/60";
    return "bg-primary/80";
  }

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Heatmap Aktivitas
        </CardTitle>
        <CardDescription className="text-xs">
          Hari × jam — area biru langit = lebih ramai.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            {/* Header row */}
            <div className="mb-1 ml-8 flex gap-[3px]">
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
            {DAYS.map((day, d) => (
              <div key={d} className="mb-[3px] flex items-center gap-[3px]">
                <div className="w-8 shrink-0 text-right pr-1 text-[10px] text-muted-foreground">
                  {day}
                </div>
                {Array.from({ length: 24 }, (_, h) => {
                  const intensity = getIntensity(d, h);
                  const cell = cellMap.get(`${d}-${h}`);
                  return (
                    <div
                      key={h}
                      className={cn(
                        "flex-1 rounded-md aspect-square border border-sky-100/50",
                        getHeatClass(intensity),
                      )}
                      title={`${day} ${h}:00 — ${cell?.count ?? 0} pesan`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Sepi</span>
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-50" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-300/30" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400/55" />
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/80" />
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
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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

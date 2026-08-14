import type { AreaPoint } from "@/components/charts/area-activity";
import { AreaActivity } from "@/components/charts/area-activity";

export interface HourlyActivityChartProps {
  data: { hour: number; messages: number; flagged: number }[];
}

export function HourlyActivityChart({ data }: HourlyActivityChartProps) {
  const points: AreaPoint[] = data.map((d) => ({
    label: `${d.hour}:00`,
    value: d.messages,
  }));
  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Hourly distribution</h3>
        <span className="text-xs text-[var(--color-ink-soft)]">
          00:00 – 23:00
        </span>
      </div>
      <AreaActivity
        data={points}
        height={140}
        stroke="var(--color-amber)"
        label="Hourly message activity"
      />
    </div>
  );
}

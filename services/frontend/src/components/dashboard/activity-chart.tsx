import type { AreaPoint } from "@/components/charts/area-activity";
import { AreaActivity } from "@/components/charts/area-activity";

export interface ActivityChartProps {
  data: {
    day: string;
    messages: number;
    flagged: number;
    active_users: number;
  }[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  const points: AreaPoint[] = data.map((d) => ({
    label: d.day,
    value: d.messages,
  }));
  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Daily messages</h3>
        <span className="pill bg-[var(--color-signal)]/15 text-[var(--color-signal)]">
          {data.length}d
        </span>
      </div>
      <ActivityChartInner points={points} />
    </div>
  );
}

function ActivityChartInner({ points }: { points: AreaPoint[] }) {
  return (
    <AreaActivity data={points} height={180} label="Daily message activity" />
  );
}

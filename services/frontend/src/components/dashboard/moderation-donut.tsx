import { RadialGauge } from "@/components/charts/radial-gauge";
import type { DashboardStats } from "@/lib/types";

export interface ModerationDonutProps {
  stats?: DashboardStats;
}

export function ModerationDonut({ stats }: ModerationDonutProps) {
  const clean = stats?.total_clean ?? 0;
  const flagged = stats?.total_flagged ?? 0;
  const warned = stats?.total_warned ?? 0;
  const total = clean + flagged + warned || 1;
  const ratio = clean / total;

  return (
    <div className="surface flex flex-col items-center gap-3 p-4">
      <h3 className="self-start text-sm font-semibold">Moderation health</h3>
      <RadialGauge
        value={ratio}
        size={150}
        label="Clean"
        tone={ratio > 0.8 ? "signal" : ratio > 0.6 ? "amber" : "vermilion"}
      />
      <div className="flex w-full flex-col gap-1.5 text-xs">
        <Row label="Clean" value={clean} tone="var(--color-signal)" />
        <Row label="Warned" value={warned} tone="var(--color-amber)" />
        <Row label="Flagged" value={flagged} tone="var(--color-vermilion)" />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[var(--color-ink-soft)]">
        <span className="size-2 rounded-full" style={{ background: tone }} />
        {label}
      </span>
      <span className="mono text-[var(--color-ink)]">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

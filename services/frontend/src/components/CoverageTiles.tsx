"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { MetricTile, SectionHeader } from "@/components/shared";
import { formatNumber } from "@/lib/format";
import type { ModerationCoverage } from "@/lib/types";

export function CoverageTiles({ coverage }: { coverage: ModerationCoverage }) {
  const pct = (n: number) => `${n.toFixed(1)}%`;
  return (
    <GlassPanel className="lg:col-span-5">
      <SectionHeader eyebrow="automation" title="Auto-mod Coverage" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="Coverage"
          value={pct(coverage.coverage_rate)}
          tone={coverage.coverage_rate > 90 ? "signal" : "amber"}
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <MetricTile
          label="Completed"
          value={formatNumber(coverage.completed)}
          tone="signal"
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <MetricTile
          label="Failed"
          value={formatNumber(coverage.failed)}
          tone={coverage.failed > 0 ? "vermilion" : "neutral"}
          icon={<XCircle className="size-3.5" />}
        />
        <MetricTile
          label="Pending"
          value={formatNumber(coverage.pending)}
          tone={coverage.pending > 0 ? "amber" : "neutral"}
          icon={<AlertCircle className="size-3.5" />}
        />
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        {pct(coverage.failed_rate)} of analysis runs failed. Total runs in
        window: {formatNumber(coverage.total)}.
      </p>
    </GlassPanel>
  );
}

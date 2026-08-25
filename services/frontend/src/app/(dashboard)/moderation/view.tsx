"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useAmbient } from "@/components/ambient/ambient-context";
import { LiveModerationFeed } from "@/components/LiveModerationFeed";
import { ModerationHeatmap } from "@/components/ModerationHeatmap";
import { Button, GlassPanel } from "@/components/primitives";
import {
  ErrorState,
  MetricTile,
  PageTransition,
  SectionHeader,
  SkeletonMetricRow,
  SkeletonPanel,
} from "@/components/shared";
import {
  useHourlyModeration,
  useModerationActions,
  useModerationCoverage,
  useModerationStats,
  useModerationTrends,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatNumber } from "@/lib/format";
import type {
  ModerationAction,
  ModerationCoverage,
  ModerationStats,
} from "@/lib/types";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export function ModerationView({
  initialStats,
  initialActions,
  initialCoverage,
}: {
  initialStats?: ModerationStats;
  initialActions?: ModerationAction[];
  initialCoverage?: ModerationCoverage;
}) {
  const {
    data: stats,
    isLoading,
    error,
    mutate,
  } = useModerationStats(initialStats);
  const { data: actions } = useModerationActions(
    undefined,
    undefined,
    initialActions,
  );
  const { data: hourly } = useHourlyModeration();
  const { data: trends } = useModerationTrends(14);
  const { data: coverage } = useModerationCoverage(30);
  const ambient = useAmbient();

  const [filterMode, setFilterMode] = useState<"all" | "flagged" | "clean">(
    "all",
  );

  const containerRef = useStaggerReveal<HTMLDivElement>(".mod-tile", {
    stagger: 0.035,
    y: 8,
    dependencies: [stats],
  });

  const executed = stats?.executed ?? 0;
  const failed = stats?.failed ?? 0;
  const total = stats?.total || 1;
  const failedRatio = failed / total;

  useEffect(() => {
    if (failedRatio > 0.15) ambient.set("vermilion", 0.5, "high failure rate");
    else if (failedRatio > 0.05) ambient.set("amber", 0.35, "moderate issues");
    else ambient.set("signal", 0.25, "moderation nominal");
  }, [failedRatio, ambient]);

  if (error && !stats)
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  if (!stats && isLoading)
    return (
      <div className="space-y-4">
        <SkeletonMetricRow cols={3} />
        <SkeletonPanel rows={6} />
      </div>
    );
  if (!stats) return null;

  return (
    <PageTransition>
      <div ref={containerRef} className="space-y-4">
        {/* Precision Sub-Header Bar */}
        <div className="mod-tile flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                failedRatio > 0.1
                  ? "bg-[#f43f5e] shadow-[0_0_8px_#f43f5e]"
                  : "bg-[#7170ff] shadow-[0_0_8px_#7170ff]"
              }`}
            />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-[#f7f8f8] uppercase">
              Moderation Intelligence Console
            </h1>
          </div>
          <div className="flex items-center gap-1.5 rounded-[5px] border border-white/[0.06] bg-white/[0.02] p-0.5">
            {(["all", "flagged", "clean"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
                  filterMode === mode
                    ? "bg-white/[0.08] text-white border border-white/[0.12]"
                    : "text-[#8a8f98] hover:text-[#d0d6e0]"
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Metric Grid */}
        <div className="mod-tile grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Total Audited"
            value={formatNumber(stats.total)}
            hint="Continuous LLM inspection"
            icon={<Shield className="size-4" />}
          />
          <MetricTile
            label="Clean Executed"
            value={formatNumber(stats.executed)}
            hint={`${Math.round((executed / total) * 100)}% execution rate`}
            tone="signal"
            icon={<CheckCircle2 className="size-4" />}
          />
          <MetricTile
            label="Pending / Failed"
            value={formatNumber(stats.pending + stats.failed)}
            hint={`${stats.failed} failed items`}
            tone={failedRatio > 0.05 ? "vermilion" : "neutral"}
            icon={<AlertTriangle className="size-4" />}
          />
        </div>

        {/* Live Moderation Stream */}
        <div className="mod-tile">
          <GlassPanel>
            <SectionHeader
              eyebrow="Realtime Feed"
              title="Live Stream Audit Log"
            />
            <div className="mt-3">
              <LiveModerationFeed
                actions={
                  actions?.filter((r) => {
                    if (filterMode === "flagged") return r.status === "failed";
                    if (filterMode === "clean") return r.status === "executed";
                    return true;
                  }) ?? []
                }
              />
            </div>
          </GlassPanel>
        </div>

        {/* Heatmap Section */}
        {hourly && hourly.length > 0 && (
          <div className="mod-tile">
            <GlassPanel>
              <SectionHeader
                eyebrow="Distribution"
                title="Hourly Incident Heatmap"
              />
              <div className="mt-3">
                <ModerationHeatmap hours={hourly} />
              </div>
            </GlassPanel>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

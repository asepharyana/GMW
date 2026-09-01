"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Globe,
  Hash,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { LiveModerationFeed } from "@/components/LiveModerationFeed";
import { ModerationHeatmap } from "@/components/ModerationHeatmap";
import { GlassPanel } from "@/components/primitives";
import { ScamDomains } from "@/components/ScamDomains";
import {
  ErrorState,
  MetricTile,
  PageTransition,
  SectionHeader,
  SkeletonMetricRow,
  SkeletonPanel,
} from "@/components/shared";
import { TopChannels } from "@/components/TopChannels";
import {
  useHourlyModeration,
  useModerationActions,
  useModerationCoverage,
  useModerationStats,
  useModerationTrends,
  useTopFlaggedChannels,
  useTopFlaggedDomains,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatNumber } from "@/lib/format";
import type {
  ModerationAction,
  ModerationCoverage,
  ModerationStats,
} from "@/lib/types";

export function ModerationView({
  initialStats,
  initialActions,
  initialCoverage: _initialCoverage,
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
  const { data: domains } = useTopFlaggedDomains(30);
  const { data: channels } = useTopFlaggedChannels(30);
  const { data: trends } = useModerationTrends(30);
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
        {/* Tactical HUD Header Bar */}
        <div className="mod-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                failedRatio > 0.1
                  ? "bg-vermilion shadow-[0_0_8px_var(--color-vermilion-glow)]"
                  : "bg-signal shadow-[0_0_8px_var(--color-signal-glow)]"
              }`}
            />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Moderation Intelligence Console
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
            <span>EXECUTION:</span>
            <span className="rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30">
              {Math.round((executed / total) * 100)}% RATE
            </span>
            {coverage && (
              <>
                <span>COVERAGE:</span>
                <span
                  className={`rounded px-2 py-0.5 font-medium border ${
                    coverage.coverage_rate >= 90
                      ? "bg-signal/15 text-signal border-signal/30"
                      : "bg-amber/15 text-amber border-amber/30"
                  }`}
                >
                  {Math.round(coverage.coverage_rate)}%
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 p-0.5">
            {(["all", "flagged", "clean"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
                  filterMode === mode
                    ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Primary Metric Grid */}
        <div className="mod-tile grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          {coverage && (
            <MetricTile
              label="Analysis Coverage"
              value={`${Math.round(coverage.coverage_rate)}%`}
              hint={`${formatNumber(coverage.completed)}/${formatNumber(coverage.total)} analyzed`}
              tone={coverage.coverage_rate >= 90 ? "signal" : "amber"}
              icon={<BarChart3 className="size-4" />}
            />
          )}
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

        {/* Domains, Channels, and Trends — 3-column row */}
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Top Flagged Domains */}
          {domains && domains.length > 0 && (
            <div className="mod-tile">
              <ScamDomains domains={domains} />
            </div>
          )}

          {/* Top Flagged Channels */}
          {channels && channels.length > 0 && (
            <div className="mod-tile">
              <TopChannels channels={channels} />
            </div>
          )}

          {/* Moderation Trends */}
          {trends && (
            <div className="mod-tile">
              <GlassPanel>
                <SectionHeader eyebrow="trends" title="Category Breakdown" />
                <div className="mt-3 space-y-3">
                  {/* Categories */}
                  {trends.categories.length > 0 && (
                    <div>
                      <div className="eyebrow mb-1.5">By Category</div>
                      <div className="flex flex-wrap gap-1.5">
                        {trends.categories.slice(0, 8).map((cat) => (
                          <span
                            key={cat.name}
                            className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-[10px] font-medium text-ink-soft"
                          >
                            {cat.name}
                            <span className="font-mono text-ink-muted">
                              {cat.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Severities */}
                  {trends.severities.length > 0 && (
                    <div>
                      <div className="eyebrow mb-1.5">By Severity</div>
                      <div className="space-y-1.5">
                        {trends.severities.map((sev) => {
                          const maxSev = Math.max(
                            ...trends.severities.map((s) => s.count),
                          );
                          const pct = maxSev
                            ? Math.round((sev.count / maxSev) * 100)
                            : 0;
                          const tone =
                            sev.level === "critical" || sev.level === "high"
                              ? "bg-vermilion"
                              : sev.level === "medium"
                                ? "bg-amber"
                                : "bg-signal";
                          return (
                            <div
                              key={sev.level}
                              className="flex items-center gap-2 text-[10px]"
                            >
                              <span className="w-16 shrink-0 font-mono text-ink-muted">
                                {sev.level}
                              </span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className={`h-full rounded-full ${tone}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-8 text-right font-mono text-ink-faint">
                                {sev.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action Types */}
                  {trends.actions.length > 0 && (
                    <div>
                      <div className="eyebrow mb-1.5">By Action Type</div>
                      <div className="flex flex-wrap gap-1.5">
                        {trends.actions.map((act) => (
                          <span
                            key={act.type}
                            className="inline-flex items-center gap-1 rounded-md border border-vermilion/20 bg-vermilion/5 px-2 py-1 text-[10px] font-medium text-vermilion/80"
                          >
                            {act.type.replace(/_/g, " ")}
                            <span className="font-mono text-ink-muted">
                              {act.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </GlassPanel>
            </div>
          )}
        </div>

        {/* Coverage Progress Bar */}
        {coverage && (
          <div className="mod-tile">
            <GlassPanel>
              <SectionHeader
                eyebrow="pipeline"
                title="Analysis Coverage"
                action={
                  <span className="font-mono text-[11px] text-ink-muted">
                    {formatNumber(coverage.completed)}/
                    {formatNumber(coverage.total)} (
                    {Math.round(coverage.coverage_rate)}%)
                  </span>
                }
              />
              <div className="mt-3">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      coverage.coverage_rate >= 90
                        ? "bg-signal"
                        : coverage.coverage_rate >= 70
                          ? "bg-amber"
                          : "bg-vermilion"
                    }`}
                    style={{
                      width: `${Math.min(100, coverage.coverage_rate)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-muted">
                  <span>{formatNumber(coverage.completed)} analyzed</span>
                  <span>
                    {formatNumber(coverage.pending)} pending ·{" "}
                    {formatNumber(coverage.failed)} failed
                  </span>
                </div>
              </div>
            </GlassPanel>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

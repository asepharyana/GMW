"use client";

import {
  AudioWaveform,
  ChevronRight,
  MessageSquare,
  Mic,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { AreaActivity, RadialGauge } from "@/components/charts";
import { GlassPanel } from "@/components/primitives";
import {
  ErrorState,
  MetricTile,
  PageTransition,
  SectionHeader,
  SkeletonHero,
  SkeletonMetricRow,
  SkeletonPanel,
} from "@/components/shared";
import { useActivity, useStats, useTopReactions } from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatNumber } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";

function deriveSignal(stats?: DashboardStats) {
  if (!stats)
    return { tone: "signal" as const, label: "NOMINAL", state: "STABLE" };
  const total = stats.total_flagged + stats.total_clean || 1;
  const ratio = stats.total_flagged / total;
  if (stats.moderation_overview.error > 0)
    return { tone: "vermilion" as const, label: "FAULT", state: "MOD_ERR" };
  if (ratio > 0.25)
    return {
      tone: "vermilion" as const,
      label: "ELEVATED",
      state: "HIGH_RISK",
    };
  if (ratio > 0.1)
    return { tone: "amber" as const, label: "WATCH", state: "ADVISORY" };
  return { tone: "signal" as const, label: "NOMINAL", state: "OPTIMAL" };
}

export function DashboardView({
  initialStats,
  initialActivity,
}: {
  initialStats?: DashboardStats;
  initialActivity?: Awaited<ReturnType<typeof useActivity>>["data"];
}) {
  const {
    data: stats,
    isLoading,
    error,
    mutate: mutateStats,
  } = useStats(initialStats);
  const { data: activity } = useActivity(14, initialActivity as never);
  const { data: reactions } = useTopReactions();
  const ambient = useAmbient();

  const hudRef = useStaggerReveal<HTMLDivElement>(".linear-tile", {
    stagger: 0.035,
    y: 8,
    dependencies: [stats],
  });

  useEffect(() => {
    const s = deriveSignal(stats);
    ambient.set(
      s.tone,
      0.3 + Math.min(0.5, (stats?.today_flagged ?? 0) / 50),
      s.label,
    );
  }, [stats, ambient]);

  if (error && !stats)
    return <ErrorState error={error} onRetry={() => void mutateStats()} />;
  if (!stats && isLoading)
    return (
      <div className="space-y-4">
        <SkeletonHero />
        <SkeletonMetricRow cols={4} />
        <SkeletonPanel rows={4} />
      </div>
    );
  if (!stats)
    return (
      <ErrorState
        error={error ?? new Error("No telemetry stream")}
        onRetry={() => void mutateStats()}
      />
    );

  const s = stats;
  const total = s.total_flagged + s.total_clean || 1;
  const cleanRatio = s.total_clean / total;

  return (
    <PageTransition>
      <div ref={hudRef} className="space-y-4">
        {/* Precision Sub-Header Bar */}
        <div className="linear-tile flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-[#7170ff] shadow-[0_0_8px_#7170ff]" />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-[#f7f8f8] uppercase">
              Telemetry Overview · Node 01
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#8a8f98]">
            <span>SIGNAL:</span>
            <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-medium text-[#7170ff] border border-white/[0.06]">
              STABLE_STREAM
            </span>
          </div>
        </div>

        {/* Primary Metric Deck */}
        <div className="linear-tile grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Total Messages"
            value={formatNumber(s.total_messages)}
            hint={`${formatNumber(s.today_messages)} today`}
            icon={<MessageSquare className="size-4" />}
          />
          <MetricTile
            label="Clean Filter Ratio"
            value={`${Math.round(cleanRatio * 100)}%`}
            hint={`${formatNumber(s.total_clean)} verified clean`}
            tone="signal"
            icon={<Shield className="size-4" />}
          />
          <MetricTile
            label="Voice Recordings"
            value={formatNumber(s.total_voice_recordings)}
            hint="Archived audio sessions"
            icon={<Mic className="size-4" />}
          />
          <MetricTile
            label="Total Profiles"
            value={formatNumber(s.total_profiles)}
            hint={`${formatNumber(s.active_users_24h)} active 24h`}
            icon={<Users className="size-4" />}
          />
        </div>

        {/* Dynamic Activity Area & Telemetry Gauges */}
        <div className="grid gap-3 lg:grid-cols-3">
          <GlassPanel className="linear-tile lg:col-span-2">
            <SectionHeader
              eyebrow="Activity Stream"
              title="Message Volume & Signal Density"
            />
            <div className="mt-4">
              <AreaActivity daily={activity?.daily ?? []} />
            </div>
          </GlassPanel>

          <GlassPanel className="linear-tile flex flex-col justify-between">
            <div>
              <SectionHeader
                eyebrow="Security State"
                title="Moderation Accuracy"
              />
              <div className="my-6 flex items-center justify-center">
                <RadialGauge
                  value={Math.round(cleanRatio * 100)}
                  label="Clean Ratio"
                  tone={cleanRatio > 0.85 ? "signal" : "amber"}
                  size={140}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-center">
              <div>
                <div className="font-mono text-[10px] text-[#8a8f98]">
                  CLEAN
                </div>
                <div className="font-sans text-sm font-semibold text-[#10b981]">
                  {formatNumber(s.total_clean)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-[#8a8f98]">
                  FLAGGED
                </div>
                <div className="font-sans text-sm font-semibold text-[#f43f5e]">
                  {formatNumber(s.total_flagged)}
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Secondary Insights Deck */}
        <div className="grid gap-3 lg:grid-cols-2">
          {reactions && reactions.length > 0 && (
            <GlassPanel className="linear-tile">
              <SectionHeader
                eyebrow="Engagement"
                title="Top Reacted Messages"
              />
              <div className="mt-3 space-y-2">
                {reactions.slice(0, 4).map((r) => (
                  <div
                    key={r.message_id}
                    className="flex items-center justify-between rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-2.5 hover:bg-white/[0.04]"
                  >
                    <span className="truncate pr-2 text-xs text-[#d0d6e0]">
                      {r.content || "[Media/Attachment]"}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#7170ff] shrink-0">
                      {formatNumber(r.reaction_count)} reactions
                    </span>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}

          <GlassPanel className="linear-tile flex flex-col justify-between">
            <div>
              <SectionHeader eyebrow="Navigation" title="Quick Diagnostics" />
              <div className="mt-2 space-y-1.5">
                <Link
                  href="/moderation"
                  className="flex items-center justify-between rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-[#d0d6e0] transition-colors hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-[#f7f8f8]"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="size-3.5 text-[#7170ff]" />
                    Review Live Moderation Queue
                  </span>
                  <ChevronRight className="size-3.5 text-[#8a8f98]" />
                </Link>
                <Link
                  href="/voice"
                  className="flex items-center justify-between rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-[#d0d6e0] transition-colors hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-[#f7f8f8]"
                >
                  <span className="flex items-center gap-2">
                    <AudioWaveform className="size-3.5 text-[#10b981]" />
                    Inspect Active Voice Stages
                  </span>
                  <ChevronRight className="size-3.5 text-[#8a8f98]" />
                </Link>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </PageTransition>
  );
}

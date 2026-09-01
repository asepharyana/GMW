"use client";

import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  ChevronRight,
  Hash,
  MessageSquare,
  Mic,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  Zap,
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
  const { data: activity } = useActivity(14, initialActivity);
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
  const mod = s.moderation_overview;
  const hasModQueue = mod.pending > 0 || mod.processing > 0 || mod.error > 0;

  return (
    <PageTransition>
      <div ref={hudRef} className="space-y-4">
        {/* Tactical HUD Header Bar */}
        <div className="linear-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-signal glow-pulse" />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Telemetry Overview · Node 01
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
            <span>SIGNAL:</span>
            <span className="rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30">
              {deriveSignal(stats).label}
            </span>
            {hasModQueue && (
              <span className="flex items-center gap-1 rounded bg-amber/15 px-2 py-0.5 font-medium text-amber border border-amber/30">
                <Zap className="size-3" />
                {mod.pending + mod.processing + mod.error} IN QUEUE
              </span>
            )}
          </div>
        </div>

        {/* Primary Metric Deck — 6 tiles */}
        <div className="linear-tile grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            label="Flagged Today"
            value={formatNumber(s.today_flagged)}
            hint={`${formatNumber(s.total_flagged)} all-time flagged`}
            tone={s.today_flagged > 0 ? "vermilion" : "neutral"}
            icon={<ShieldAlert className="size-4" />}
          />
          <MetricTile
            label="Active Users 24h"
            value={formatNumber(s.active_users_24h)}
            hint={`${formatNumber(s.total_users)} total profiles`}
            icon={<Users className="size-4" />}
          />
          <MetricTile
            label="Voice Recordings"
            value={formatNumber(s.total_voice_recordings)}
            hint="Archived audio sessions"
            icon={<Mic className="size-4" />}
          />
          <MetricTile
            label="Mod Queue"
            value={formatNumber(mod.pending + mod.processing)}
            hint={mod.error > 0 ? `${mod.error} errors` : "Processing pipeline"}
            tone={
              mod.error > 0
                ? "vermilion"
                : mod.pending > 0
                  ? "amber"
                  : "neutral"
            }
            icon={<Activity className="size-4" />}
          />
        </div>

        {/* Moderation Queue Status Bar */}
        {hasModQueue && (
          <div className="linear-tile flex flex-wrap items-center gap-4 rounded-[8px] border border-amber/20 bg-amber/5 px-4 py-2.5 font-mono text-[10px] text-ink-soft">
            <span className="text-amber font-semibold uppercase">
              Pipeline Status
            </span>
            {mod.pending > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-amber" />
                {mod.pending} PENDING
              </span>
            )}
            {mod.processing > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-signal animate-pulse" />
                {mod.processing} PROCESSING
              </span>
            )}
            {mod.error > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-vermilion" />
                {mod.error} ERROR
              </span>
            )}
          </div>
        )}

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
            <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
              <div>
                <div className="eyebrow">CLEAN</div>
                <div className="font-sans text-sm font-semibold text-success">
                  {formatNumber(s.total_clean)}
                </div>
              </div>
              <div>
                <div className="eyebrow">FLAGGED</div>
                <div className="font-sans text-sm font-semibold text-vermilion">
                  {formatNumber(s.total_flagged)}
                </div>
              </div>
              <div>
                <div className="eyebrow">WARNED</div>
                <div className="font-sans text-sm font-semibold text-amber">
                  {formatNumber(s.total_warned)}
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Top Channels + Engagement Row */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Top Channels Ranking */}
          {s.top_channels && s.top_channels.length > 0 && (
            <GlassPanel className="linear-tile">
              <SectionHeader
                eyebrow="volume"
                title="Top Active Channels"
                action={
                  <Link
                    href="/analysis"
                    className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
                  >
                    View All
                    <ChevronRight className="size-3" />
                  </Link>
                }
              />
              <div className="mt-3 space-y-2">
                {s.top_channels.slice(0, 6).map((ch, i) => {
                  const maxCount = s.top_channels[0]?.message_count || 1;
                  const pct = Math.max(
                    4,
                    Math.round((ch.message_count / maxCount) * 100),
                  );
                  return (
                    <div
                      key={ch.channel_id}
                      className="flex items-center gap-3 text-xs"
                    >
                      <span className="font-mono w-4 text-[10px] text-ink-faint">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="w-28 shrink-0 truncate font-mono text-xs text-ink sm:w-36">
                        <Hash className="mr-0.5 inline size-3 text-signal" />
                        {ch.channel_name ?? ch.channel_id.slice(0, 14)}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-signal"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono w-16 text-right text-[11px] font-semibold text-signal">
                        {formatNumber(ch.message_count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>
          )}

          {/* Top Reacted Messages */}
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
                    className="hud-card flex items-start justify-between gap-2 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-1 block text-xs text-ink-soft">
                        {r.content || "[Media/Attachment]"}
                      </span>
                      {r.username && (
                        <span className="mt-0.5 block font-mono text-[10px] text-ink-muted">
                          @{r.username}
                          {r.channel_name && ` in #${r.channel_name}`}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono text-xs font-semibold text-signal">
                        {formatNumber(r.reaction_count)}
                      </span>
                      {r.top_emojis && r.top_emojis.length > 0 && (
                        <div className="mt-0.5 flex gap-0.5">
                          {r.top_emojis.map((e) => (
                            <span
                              key={e.emoji}
                              className="text-[10px]"
                              title={`${e.emoji} ×${e.count}`}
                            >
                              {e.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* Quick Navigation */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/moderation"
            className="linear-tile hud-card flex items-center justify-between p-3 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-signal" />
              Live Moderation Queue
            </span>
            <ChevronRight className="size-3.5 text-ink-muted" />
          </Link>
          <Link
            href="/voice"
            className="linear-tile hud-card flex items-center justify-between p-3 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <AudioWaveform className="size-3.5 text-success" />
              Active Voice Stages
            </span>
            <ChevronRight className="size-3.5 text-ink-muted" />
          </Link>
          <Link
            href="/analysis"
            className="linear-tile hud-card flex items-center justify-between p-3 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber" />
              Flagged Content Analysis
            </span>
            <ChevronRight className="size-3.5 text-ink-muted" />
          </Link>
          <Link
            href="/recordings"
            className="linear-tile hud-card flex items-center justify-between p-3 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <Mic className="size-3.5 text-vermilion" />
              Voice Recording Archive
            </span>
            <ChevronRight className="size-3.5 text-ink-muted" />
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}

"use client";

import {
  AudioWaveform,
  ChevronRight,
  Flame,
  MessageSquare,
  Mic,
  Shield,
  ShieldAlert,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { AreaActivity, RadialGauge } from "@/components/charts";
import { GlassPanel } from "@/components/primitives";
import {
  ErrorState,
  PageTransition,
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

  const hudRef = useStaggerReveal<HTMLDivElement>(".hud-tile", {
    stagger: 0.05,
    y: 16,
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
      <div className="space-y-5">
        <SkeletonHero />
        <SkeletonMetricRow cols={4} />
        <SkeletonPanel rows={5} />
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
  const sig = deriveSignal(s);

  return (
    <PageTransition>
      <div ref={hudRef} className="space-y-4">
        {/* Tactical HUD Header Bar */}
        <div className="hud-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex size-3 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-signal" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="font-mono text-xs font-semibold tracking-widest text-ink uppercase">
                GMW TELEMETRY · MATRIX_01
              </h1>
              <span className="font-mono text-[10px] text-ink-faint">
                [LIVE_MONITOR]
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              <span className="text-ink-faint">SYS_STATUS:</span>
              <span className="font-bold text-signal">{sig.state}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              <span className="text-ink-faint">VER:</span>
              <span className="text-ink">v2.4-GSAP</span>
            </div>
          </div>
        </div>

        {/* Spatial HUD Grid: Live Mission Control */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Main Telemetry & Activity Area */}
          <div className="space-y-4 lg:col-span-8">
            {/* Primary Telemetry Cluster */}
            <div className="hud-tile grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="group relative overflow-hidden rounded-md border border-hairline bg-surface/50 p-3.5 backdrop-blur-md transition-colors hover:border-signal/40">
                <div className="flex items-center justify-between text-ink-faint">
                  <span className="font-mono text-[10px] tracking-wider uppercase">
                    Messages
                  </span>
                  <MessageSquare className="size-3.5 text-signal" />
                </div>
                <div className="mt-2 font-mono text-xl font-bold tracking-tight text-ink">
                  {formatNumber(s.total_messages)}
                </div>
                <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-ink-faint">
                  <span className="text-signal">↑ live</span> ingest
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-md border border-hairline bg-surface/50 p-3.5 backdrop-blur-md transition-colors hover:border-signal/40">
                <div className="flex items-center justify-between text-ink-faint">
                  <span className="font-mono text-[10px] tracking-wider uppercase">
                    Flagged
                  </span>
                  <ShieldAlert className="size-3.5 text-vermilion" />
                </div>
                <div className="mt-2 font-mono text-xl font-bold tracking-tight text-ink">
                  {formatNumber(s.total_flagged)}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-faint">
                  <span className="text-vermilion">{s.today_flagged}</span>{" "}
                  today
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-md border border-hairline bg-surface/50 p-3.5 backdrop-blur-md transition-colors hover:border-signal/40">
                <div className="flex items-center justify-between text-ink-faint">
                  <span className="font-mono text-[10px] tracking-wider uppercase">
                    Active 24h
                  </span>
                  <Users className="size-3.5 text-signal" />
                </div>
                <div className="mt-2 font-mono text-xl font-bold tracking-tight text-ink">
                  {formatNumber(s.active_users_24h)}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-faint">
                  <span>unique accounts</span>
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-md border border-hairline bg-surface/50 p-3.5 backdrop-blur-md transition-colors hover:border-signal/40">
                <div className="flex items-center justify-between text-ink-faint">
                  <span className="font-mono text-[10px] tracking-wider uppercase">
                    Voice Captures
                  </span>
                  <Mic className="size-3.5 text-signal" />
                </div>
                <div className="mt-2 font-mono text-xl font-bold tracking-tight text-ink">
                  {formatNumber(s.total_voice_recordings)}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-faint">
                  <span>audio buffers</span>
                </div>
              </div>
            </div>

            {/* Activity Waveform / Time Series */}
            <GlassPanel className="hud-tile rounded-md border border-hairline bg-surface/40 p-4 backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-ink-faint uppercase">
                    CHRONO TELEMETRY (14D)
                  </div>
                  <div className="text-sm font-medium text-ink">
                    Message & Activity Stream
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <div className="flex items-center gap-1 text-ink-soft">
                    <span className="size-2 rounded-full bg-signal" />
                    <span>Activity Trend</span>
                  </div>
                </div>
              </div>
              <div className="h-56 w-full">
                {activity?.daily ? (
                  <AreaActivity daily={activity.daily} />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-xs text-ink-faint">
                    ACQUIRING SIGNAL...
                  </div>
                )}
              </div>
            </GlassPanel>

            {/* Quick Tactical Links */}
            <div className="hud-tile grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Link
                href="/voice"
                className="group flex items-center justify-between rounded-md border border-hairline bg-surface/30 p-3 transition hover:border-signal/50 hover:bg-surface/60"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded bg-canvas-2 text-signal group-hover:bg-signal group-hover:text-signal-ink">
                    <AudioWaveform className="size-4" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-ink">
                      Voice Matrix
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      Realtime speaker stream
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-4 text-ink-faint group-hover:text-signal" />
              </Link>

              <Link
                href="/messages"
                className="group flex items-center justify-between rounded-md border border-hairline bg-surface/30 p-3 transition hover:border-signal/50 hover:bg-surface/60"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded bg-canvas-2 text-signal group-hover:bg-signal group-hover:text-signal-ink">
                    <Terminal className="size-4" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-ink">
                      Chat Log Stream
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      Live telemetry feed
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-4 text-ink-faint group-hover:text-signal" />
              </Link>

              <Link
                href="/moderation"
                className="group flex items-center justify-between rounded-md border border-hairline bg-surface/30 p-3 transition hover:border-signal/50 hover:bg-surface/60"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded bg-canvas-2 text-signal group-hover:bg-signal group-hover:text-signal-ink">
                    <Shield className="size-4" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-ink">
                      Auto-Mod Radar
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      Classification & audits
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-4 text-ink-faint group-hover:text-signal" />
              </Link>
            </div>
          </div>

          {/* Side Telemetry Panel: Health, Dials, & Nodes */}
          <div className="space-y-4 lg:col-span-4">
            {/* Safety & Moderation Integrity Gauge */}
            <GlassPanel className="hud-tile rounded-md border border-hairline bg-surface/40 p-4 backdrop-blur-md">
              <div className="font-mono text-[10px] tracking-widest text-ink-faint uppercase">
                INTEGRITY MATRIX
              </div>
              <div className="mt-1 text-sm font-medium text-ink">
                Clean Stream Ratio
              </div>
              <div className="my-4 flex items-center justify-center">
                <RadialGauge
                  value={Math.round(cleanRatio * 100)}
                  size={140}
                  tone={cleanRatio > 0.9 ? "signal" : "amber"}
                  label={`${Math.round(cleanRatio * 100)}%`}
                  sublabel="CLEAN RATIO"
                />
              </div>
              <div className="space-y-2 border-t border-hairline pt-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-faint">Clean Messages:</span>
                  <span className="font-medium text-ink">
                    {formatNumber(s.total_clean)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-faint">Pending Flags:</span>
                  <span className="font-medium text-vermilion">
                    {formatNumber(s.total_flagged)}
                  </span>
                </div>
              </div>
            </GlassPanel>

            {/* Top Reacted Messages / Emitters */}
            <GlassPanel className="hud-tile rounded-md border border-hairline bg-surface/40 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-ink-faint uppercase">
                    FREQUENT EMITTERS
                  </div>
                  <div className="text-sm font-medium text-ink">
                    Top Reacted Messages
                  </div>
                </div>
                <Flame className="size-4 text-amber" />
              </div>

              <div className="mt-3 space-y-2">
                {reactions && reactions.length > 0 ? (
                  reactions.slice(0, 4).map((r) => (
                    <div
                      key={r.message_id}
                      className="flex items-center justify-between rounded bg-surface/30 px-2.5 py-1.5 font-mono text-xs"
                    >
                      <span className="max-w-[150px] truncate text-ink-soft">
                        {r.username ? `@${r.username}` : "anonymous"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-faint">reacts:</span>
                        <span className="font-bold text-signal">
                          {r.reaction_count}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center font-mono text-xs text-ink-faint">
                    NO EMITTER TELEMETRY
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

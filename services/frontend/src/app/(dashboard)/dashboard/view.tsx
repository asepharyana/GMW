"use client";

/**
 * Dashboard scene — guild star + channel orbit live on the stage canvas;
 * this overlay adds the metric whisper (top-left), activity ribbon
 * (bottom-left), and moderation gauge (right) as floating panels.
 */
import { Activity, Flag, ShieldAlert } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { AreaActivity, RadialGauge } from "@/components/charts";
import { ErrorState, LoadingState } from "@/components/shared";
import { useScenePublish } from "@/components/shell/scene-graph-context";
import { useActivity, useStats } from "@/hooks";
import { statsToGraph } from "@/lib/constellation/graph";
import { formatNumber } from "@/lib/format";
import type { DashboardStats } from "@/lib/types";
import { staggerDelay } from "@/lib/utils";

function deriveSignal(stats?: DashboardStats) {
  if (!stats) return { tone: "signal" as const, label: "nominal" };
  const total = stats.total_flagged + stats.total_clean || 1;
  const ratio = stats.total_flagged / total;
  if (stats.moderation_overview.error > 0)
    return { tone: "vermilion" as const, label: "moderation fault" };
  if (ratio > 0.25)
    return { tone: "vermilion" as const, label: "elevated flags" };
  if (ratio > 0.1) return { tone: "amber" as const, label: "watch" };
  return { tone: "signal" as const, label: "nominal" };
}

export function DashboardView({
  initialStats,
  initialActivity,
}: {
  initialStats?: DashboardStats;
  initialActivity?: Awaited<ReturnType<typeof useActivity>>["data"];
}) {
  const { data: stats, error } = useStats(initialStats);
  const { data: activity } = useActivity(14, initialActivity as never);
  const ambient = useAmbient();
  const publish = useScenePublish();

  const graph = useMemo(
    () => (stats ? statsToGraph(stats) : { nodes: [], edges: [] }),
    [stats],
  );

  useEffect(() => {
    publish({ graph, focus: "guild" });
  }, [graph, publish]);

  useEffect(() => {
    const s = deriveSignal(stats);
    ambient.set(
      s.tone,
      0.3 + Math.min(0.5, (stats?.today_flagged ?? 0) / 50),
      s.label,
    );
  }, [stats, ambient]);

  if (error && !stats) return <ErrorState error={error} />;
  if (!stats) return <LoadingState label="aligning constellation" />;

  const s = stats;
  const total = s.total_flagged + s.total_clean || 1;
  const cleanRatio = s.total_clean / total;

  return (
    <div className="min-h-full">
      {/* Metric whisper — top-left under brand */}
      <section
        className="pointer-events-auto absolute left-5 top-16 w-64 animate-stagger"
        style={staggerDelay(0)}
        aria-label="Key metrics"
      >
        <p className="eyebrow mb-2">Operations · {deriveSignal(s).label}</p>
        <div className="space-y-1.5">
          <WhisperRow
            label="messages"
            value={formatNumber(s.total_messages)}
            tone="ink"
          />
          <WhisperRow
            label="flagged"
            value={formatNumber(s.total_flagged)}
            tone={s.total_flagged > 0 ? "vermilion" : "ink"}
            hint={`${s.today_flagged} today`}
          />
          <WhisperRow
            label="active 24h"
            value={formatNumber(s.active_users_24h)}
            tone="signal"
          />
          <WhisperRow
            label="voice clips"
            value={formatNumber(s.total_voice_recordings)}
            tone="ink"
          />
        </div>
      </section>

      {/* Activity ribbon — bottom-left */}
      <section
        className="pointer-events-auto absolute bottom-20 left-5 hidden w-80 lg:block"
        aria-label="Activity"
      >
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <Activity className="size-3.5 text-signal" /> 14-day signal
        </p>
        {activity ? (
          <AreaActivity daily={activity.daily} />
        ) : (
          <LoadingState label="streaming" />
        )}
      </section>

      {/* Moderation gauge — right */}
      <section
        className="pointer-events-auto absolute right-5 top-16 hidden w-56 md:block"
        aria-label="Moderation"
      >
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <ShieldAlert className="size-3.5 text-signal" /> Trust
        </p>
        <RadialGauge
          value={cleanRatio}
          tone={
            cleanRatio > 0.8
              ? "signal"
              : cleanRatio > 0.6
                ? "amber"
                : "vermilion"
          }
          label={`${Math.round(cleanRatio * 100)}%`}
          sublabel="clean"
        />
        <div className="mt-3 space-y-1 font-mono text-xs text-[var(--color-ink-soft)]">
          <p className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Flag className="size-3 text-vermilion" /> flagged
            </span>
            <span>{formatNumber(s.total_flagged)}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>warned</span>
            <span>{formatNumber(s.total_warned)}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>pending</span>
            <span>{s.moderation_overview.pending}</span>
          </p>
          <p className="flex items-center justify-between">
            <span>processing</span>
            <span>{s.moderation_overview.processing}</span>
          </p>
        </div>
      </section>
    </div>
  );
}

function WhisperRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "ink" | "signal" | "vermilion";
  hint?: string;
}) {
  const color =
    tone === "vermilion"
      ? "text-vermilion"
      : tone === "signal"
        ? "text-signal"
        : "text-ink";
  return (
    <p className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </span>
      <span className={`display text-lg leading-none ${color}`}>{value}</span>
      {hint ? (
        <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
          {hint}
        </span>
      ) : null}
    </p>
  );
}

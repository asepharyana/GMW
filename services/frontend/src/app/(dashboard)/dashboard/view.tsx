"use client";

import {
  Activity,
  Flag,
  MessageSquare,
  Mic,
  Radio,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { AreaActivity, RadialGauge } from "@/components/charts";
import { GlassPanel } from "@/components/primitives";
import {
  ErrorState,
  LoadingState,
  SkeletonHero,
  SkeletonMetricRow,
  SkeletonPanel,
} from "@/components/shared";
import { MetricTile, SectionHeader } from "@/components/shared/section";
import {
  useActivity,
  useStats,
  useTopReactions,
  useTopReactors,
} from "@/hooks";
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
  const {
    data: stats,
    isLoading,
    error,
    mutate: mutateStats,
  } = useStats(initialStats);
  const { data: activity } = useActivity(14, initialActivity as never);
  const { data: reactors } = useTopReactors();
  const { data: reactions } = useTopReactions();
  const ambient = useAmbient();

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
        <div className="grid gap-5 lg:grid-cols-5">
          <SkeletonPanel className="lg:col-span-3" rows={4} />
          <SkeletonPanel className="lg:col-span-2" rows={4} />
        </div>
      </div>
    );
  if (!stats)
    return (
      <ErrorState
        error={error ?? new Error("No data")}
        onRetry={() => void mutateStats()}
      />
    );

  const s = stats;
  const total = s.total_flagged + s.total_clean || 1;
  const cleanRatio = s.total_clean / total;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <GlassPanel glow className="game-frame relative overflow-hidden">
        <div className="scan-line absolute inset-x-0 top-0" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">GMW · Operations Grid</div>
            <h2 className="display hero-clamp leading-none text-ink glow-signal">
              Ambient Field
            </h2>
            <p className="mt-2 max-w-md text-pretty text-sm text-ink-soft">
              Real-time moderation, voice & media presence across the monitored
              guild. {formatNumber(s.total_messages)} messages captured.
            </p>
          </div>
          <div className="flex items-center gap-2 text-ink-soft">
            <Radio className="size-4 text-signal animate-breathe" />
            <span className="mono text-xs uppercase tracking-wider">
              {deriveSignal(s).label}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile
            label="Messages"
            value={formatNumber(s.total_messages)}
            tone="signal"
            icon={<MessageSquare className="size-3.5" />}
            className="animate-stagger"
            style={staggerDelay(0)}
          />
          <MetricTile
            label="Flagged"
            value={formatNumber(s.total_flagged)}
            tone={s.total_flagged > 0 ? "vermilion" : "neutral"}
            hint={`${s.today_flagged} today`}
            className="animate-stagger"
            style={staggerDelay(1)}
          />
          <MetricTile
            label="Active 24h"
            value={formatNumber(s.active_users_24h)}
            tone="signal"
            icon={<Users className="size-3.5" />}
            className="animate-stagger"
            style={staggerDelay(2)}
          />
          <MetricTile
            label="Voice clips"
            value={formatNumber(s.total_voice_recordings)}
            icon={<Mic className="size-3.5" />}
            className="animate-stagger"
            style={staggerDelay(3)}
          />
        </div>
      </GlassPanel>

      {/* Activity */}
      <GlassPanel>
        <SectionHeader
          eyebrow="14-day signal"
          title={
            <span className="flex items-center gap-2">
              <Activity className="size-4 text-signal" /> Activity & moderation
            </span>
          }
          action={
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-signal" /> messages
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-vermilion" /> flagged
              </span>
            </div>
          }
        />
        {activity ? (
          <AreaActivity daily={activity.daily} />
        ) : (
          <LoadingState label="streaming" />
        )}
      </GlassPanel>

      {/* Two-column: channels + moderation */}
      <div className="grid gap-5 lg:grid-cols-5">
        <GlassPanel className="lg:col-span-3">
          <SectionHeader eyebrow="throughput" title="Top channels" />
          <div className="space-y-2.5">
            {s.top_channels.slice(0, 7).map((c) => {
              const pct =
                (c.message_count / (s.top_channels[0]?.message_count || 1)) *
                100;
              return (
                <div key={c.channel_id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-ink-soft sm:w-40">
                    {c.channel_name ?? c.channel_id.slice(0, 8)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-signal/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="mono w-14 text-right text-xs text-ink-faint">
                    {formatNumber(c.message_count)}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassPanel>

        <GlassPanel className="lg:col-span-2">
          <SectionHeader eyebrow="trust" title="Moderation" />
          <div className="flex items-center gap-5">
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
            <div className="flex-1 space-y-2 text-sm">
              <Row
                icon={<ShieldAlert className="size-4 text-signal" />}
                label="Clean"
                value={formatNumber(s.total_clean)}
              />
              <Row
                icon={<Flag className="size-4 text-vermilion" />}
                label="Flagged"
                value={formatNumber(s.total_flagged)}
              />
              <Row
                icon={<Activity className="size-4 text-amber" />}
                label="Warned"
                value={formatNumber(s.total_warned)}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-around border-t border-hairline pt-3 text-center">
            <Mini
              label="pending"
              value={s.moderation_overview.pending}
              tone="amber"
            />
            <Mini
              label="processing"
              value={s.moderation_overview.processing}
              tone="signal"
            />
            <Mini
              label="errors"
              value={s.moderation_overview.error}
              tone="vermilion"
            />
          </div>
        </GlassPanel>
      </div>

      {/* Reactors + reactions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassPanel>
          <SectionHeader eyebrow="engagement" title="Top reactors" />
          <div className="space-y-2">
            {(reactors ?? []).slice(0, 6).map((r, i) => {
              const maxNet = reactors?.[0]?.net_count || 1;
              const pct = Math.max(4, Math.round((r.net_count / maxNet) * 100));
              return (
                <div key={r.user_id} className="flex items-center gap-3">
                  <span className="mono w-5 text-ink-faint">{i + 1}</span>
                  <span className="w-28 shrink-0 truncate text-sm text-ink-soft sm:w-40">
                    {r.username}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-signal/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="mono w-12 text-right text-xs text-signal">
                    +{formatNumber(r.net_count)}
                  </span>
                </div>
              );
            })}
            {(reactors ?? []).length === 0 && <EmptyHint />}
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader eyebrow="culture" title="Top reactions" />
          <div className="space-y-3">
            {(reactions ?? []).slice(0, 5).map((m) => (
              <div key={m.message_id} className="flex items-start gap-3">
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {m.top_emojis.slice(0, 3).map((e, i) => (
                    <span
                      key={`${m.message_id}-${i}`}
                      className="text-lg leading-none"
                    >
                      {e.emoji}
                    </span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">
                    {m.content || "(no text)"}
                  </div>
                  <div className="mono text-[0.65rem] text-ink-faint">
                    {m.username} · {m.channel_name ?? m.channel_id.slice(0, 8)}
                  </div>
                </div>
                <span className="mono text-xs text-ink-soft">
                  {m.reaction_count}
                </span>
              </div>
            ))}
            {(reactions ?? []).length === 0 && <EmptyHint />}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className="flex-1 text-ink-soft">{label}</span>
      <span className="mono text-ink">{value}</span>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "signal" | "amber" | "vermilion";
}) {
  const color =
    tone === "vermilion"
      ? "text-vermilion"
      : tone === "amber"
        ? "text-amber"
        : "text-signal";
  return (
    <div>
      <div className={`display text-xl ${color}`}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="py-6 text-center text-xs text-ink-faint">
      Awaiting data…
    </div>
  );
}

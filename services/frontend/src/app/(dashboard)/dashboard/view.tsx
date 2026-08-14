"use client";

import {
  Activity as ActivityIcon,
  Flag,
  MessagesSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { Sparkline } from "@/components/charts/sparkline";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { ChannelsSection } from "@/components/dashboard/channels-section";
import { HourlyActivityChart } from "@/components/dashboard/hourly-activity-chart";
import { ModerationDonut } from "@/components/dashboard/moderation-donut";
import { ReactionsSection } from "@/components/dashboard/reactions-section";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { UsersSection } from "@/components/dashboard/users-section";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { SignalField } from "@/components/three";
import { useActivity, useStats } from "@/hooks";
import type { DashboardActivity, DashboardStats } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "stats" | "users" | "channels" | "reactions";

const DAYS = [7, 14, 30] as const;

export default function DashboardView({
  initialStats,
  initialActivity,
}: {
  initialStats?: DashboardStats;
  initialActivity?: DashboardActivity;
}) {
  const [tab, setTab] = useState<Tab>("stats");
  const [days, setDays] = useState<number>(14);
  const reduce = useReducedMotion();

  const { data: stats } = useStats(initialStats);
  const { data: activity } = useActivity(
    days,
    days === 14 ? initialActivity : undefined,
  );

  const clean = stats?.total_clean ?? 0;
  const flagged = stats?.total_flagged ?? 0;
  const warned = stats?.total_warned ?? 0;
  const total = clean + flagged + warned || 1;
  const health = clean / total;
  const activityRatio = Math.min(
    1,
    (activity?.daily.at(-1)?.messages ?? 0) /
      (Math.max(...(activity?.daily.map((d) => d.messages) ?? [1]), 1) || 1),
  );

  const daily = activity?.daily ?? [];
  const spark = daily.map((d) => d.messages);
  const flaggedSpark = daily.map((d) => d.flagged);
  const usersSpark = daily.map((d) => d.active_users);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "stats",
      label: "Stats",
      icon: <MessagesSquare className="size-3.5" />,
    },
    { id: "users", label: "Users", icon: <Users className="size-3.5" /> },
    {
      id: "channels",
      label: "Channels",
      icon: <ActivityIcon className="size-3.5" />,
    },
    {
      id: "reactions",
      label: "Reactions",
      icon: <Flag className="size-3.5" />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Hero stats={stats} activityRatio={activityRatio} health={health} />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-[var(--radius-r)] bg-[var(--color-surface-2)] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--radius-r-control)] px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-[var(--color-signal)] text-[var(--color-signal-ink)]"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="ms-auto flex gap-1">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-[var(--radius-r-control)] px-2.5 py-1 text-xs font-mono transition-colors",
                days === d
                  ? "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Ticker row (stats tab) */}
      {tab === "stats" && (
        <StaggerGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Ticker
            icon={<MessagesSquare className="size-4" />}
            label="Messages"
            value={stats?.total_messages ?? 0}
            data={spark}
          />
          <Ticker
            icon={<Flag className="size-4" />}
            label="Flagged"
            value={flagged}
            data={flaggedSpark}
            tone="vermilion"
          />
          <Ticker
            icon={<Users className="size-4" />}
            label="Active 24h"
            value={stats?.active_users_24h ?? 0}
            data={usersSpark}
            tone="amber"
          />
          <Ticker
            icon={<ShieldCheck className="size-4" />}
            label="Recordings"
            value={stats?.total_voice_recordings ?? 0}
            data={spark}
          />
        </StaggerGroup>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {tab === "stats" && (
            <>
              <ActivityChart data={daily} />
              <HourlyActivityChart data={activity?.hourly ?? []} />
              <TopChannelsChart channels={stats?.top_channels ?? []} />
            </>
          )}
          {tab === "users" && <UsersSection />}
          {tab === "channels" && <ChannelsSection />}
          {tab === "reactions" && <ReactionsSection />}
        </div>
        <div className="xl:col-span-1">
          <ModerationDonut stats={stats} />
        </div>
      </div>
    </div>
  );
}

function Hero({
  stats,
  activityRatio,
  health,
}: {
  stats?: DashboardStats;
  activityRatio: number;
  health: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-r)] bg-[var(--color-surface)] p-5">
      <div className="absolute inset-0 opacity-50">
        <SignalField activity={activityRatio} className="size-full" />
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="display text-3xl">Bete Console</div>
          <div className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {stats?.total_messages?.toLocaleString() ?? 0} messages watched ·{" "}
            {stats?.total_users?.toLocaleString() ?? 0} users
          </div>
        </div>
        <RadialGauge
          value={health}
          size={132}
          label="Clean"
          tone={health > 0.8 ? "signal" : health > 0.6 ? "amber" : "vermilion"}
        />
      </div>
    </div>
  );
}

function Ticker({
  icon,
  label,
  value,
  data,
  tone = "signal",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  data: number[];
  tone?: "signal" | "amber" | "vermilion";
}) {
  const color = {
    signal: "var(--color-signal)",
    amber: "var(--color-amber)",
    vermilion: "var(--color-vermilion)",
  }[tone];
  return (
    <StaggerItem className="surface scan-tick flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="display text-2xl" style={{ color }}>
        {value.toLocaleString()}
      </div>
      <Sparkline
        data={data}
        width={220}
        height={32}
        stroke={color}
        className="w-full"
      />
    </StaggerItem>
  );
}

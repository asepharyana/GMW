"use client";

import {
  AlertCircle,
  Clock,
  Hash,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { ChannelsSection } from "@/components/dashboard/channels-section";
import { HourlyActivityChart } from "@/components/dashboard/hourly-activity-chart";
import { ModerationDonut } from "@/components/dashboard/moderation-donut";
import { StatCard } from "@/components/dashboard/stat-card";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { UsersSection } from "@/components/dashboard/users-section";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { useActivity, useStats } from "@/hooks";
import { cn } from "@/lib/utils";

type DashboardTab = "stats" | "users" | "channels";

const DAY_RANGES = [7, 14, 30] as const;

const MODERATION_COLORS: Record<string, string> = {
  Clean: "oklch(0.72 0.16 155)",
  Flagged: "oklch(0.62 0.19 25)",
  Warned: "oklch(0.78 0.15 80)",
  Error: "oklch(0.55 0.02 245)",
};

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("stats");
  const [days, setDays] = useState<number>(14);
  const { data: stats, isLoading, error, mutate: refetch } = useStats();
  const { data: activity, isLoading: activityLoading } = useActivity(days);

  const subNavTabs = [
    { id: "stats", label: "Stats", icon: <Hash className="size-3" /> },
    { id: "users", label: "Users", icon: <Users className="size-3" /> },
    { id: "channels", label: "Channels", icon: <Hash className="size-3" /> },
  ];

  const moderationData = stats
    ? [
        {
          name: "Clean",
          value: stats.total_clean,
          color: MODERATION_COLORS.Clean,
        },
        {
          name: "Flagged",
          value: stats.total_flagged,
          color: MODERATION_COLORS.Flagged,
        },
        {
          name: "Warned",
          value: stats.total_warned,
          color: MODERATION_COLORS.Warned,
        },
        {
          name: "Error",
          value: stats.total_error,
          color: MODERATION_COLORS.Error,
        },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={subNavTabs}
        activeTab={tab}
        onTabChange={(t) => setTab(t as DashboardTab)}
      />

      {tab === "stats" && (
        <div className="space-y-4">
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : isLoading || !stats ? (
            <LoadingSkeleton count={6} height="h-28" columns={3} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label="Total Messages"
                  value={stats.total_messages}
                  icon={Hash}
                />
                <StatCard
                  label="Today"
                  value={stats.today_messages}
                  icon={Clock}
                />
                <StatCard
                  label="Users"
                  value={stats.total_users}
                  icon={Users}
                />
                <StatCard
                  label="Active 24h"
                  value={stats.active_users_24h}
                  icon={Sparkles}
                />
                <StatCard
                  label="Flagged"
                  value={stats.total_flagged}
                  icon={AlertCircle}
                  variant="danger"
                />
                <StatCard
                  label="Clean"
                  value={stats.total_clean}
                  icon={Shield}
                  variant="success"
                />
              </div>

              <div className="flex items-center justify-end gap-1">
                {DAY_RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDays(range)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide rounded-md transition-colors",
                      days === range
                        ? "bg-primary/20 text-primary"
                        : "text-text-secondary/60 hover:text-text-primary",
                    )}
                  >
                    {range}d
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  {activityLoading ? (
                    <LoadingSkeleton count={1} height="h-56" />
                  ) : (
                    <ActivityChart data={activity?.daily} />
                  )}
                </div>
                <ModerationDonut data={moderationData} />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  {activityLoading ? (
                    <LoadingSkeleton count={1} height="h-40" />
                  ) : (
                    <HourlyActivityChart data={activity?.hourly} />
                  )}
                </div>
                <TopChannelsChart
                  data={stats.top_channels.map((c) => ({
                    name: c.channel_name ?? c.channel_id,
                    count: c.message_count,
                  }))}
                />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "users" && <UsersSection />}

      {tab === "channels" && <ChannelsSection />}
    </div>
  );
}

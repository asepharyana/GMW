"use client";

import { AlertCircle, Clock, Hash, Shield, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { useStats } from "@/hooks";
import { StatCard } from "@/components/dashboard/stat-card";
import { LiveStream } from "@/components/dashboard/live-stream";
import { ModQueue } from "@/components/dashboard/mod-queue";
import { MessageTrendChart } from "@/components/dashboard/message-trend-chart";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";

type DashboardTab = "stats" | "live" | "activity";

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("stats");
  const { data: stats, isLoading, error, refetch } = useStats();

  const subNavTabs = [
    { id: "stats", label: "Stats", icon: <Hash className="size-3" /> },
    { id: "live", label: "Live", icon: <Sparkles className="size-3" /> },
    { id: "activity", label: "Activity", icon: <Clock className="size-3" /> },
  ];

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav tabs={subNavTabs} activeTab={tab} onTabChange={(t) => setTab(t as DashboardTab)} />

      {tab === "stats" && (
        <div className="space-y-4">
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : isLoading || !stats ? (
            <LoadingSkeleton count={6} height="h-28" columns={3} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Total Messages" value={stats.total_messages} icon={Hash} />
                <StatCard label="Today" value={stats.today_messages} icon={Clock} />
                <StatCard label="Users" value={stats.total_users} icon={Users} />
                <StatCard label="Active 24h" value={stats.active_users_24h} icon={Sparkles} />
                <StatCard label="Flagged" value={stats.total_flagged} icon={AlertCircle} variant="danger" />
                <StatCard label="Clean" value={stats.total_clean} icon={Shield} variant="success" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MessageTrendChart />
                <TopChannelsChart />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "live" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LiveStream />
          <ModQueue />
        </div>
      )}

      {tab === "activity" && (
        <div className="grid grid-cols-1 gap-4">
          <ActivityHeatmap />
        </div>
      )}
    </div>
  );
}

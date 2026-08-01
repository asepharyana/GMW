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
import { ChannelsSection } from "@/components/dashboard/channels-section";
import { LiveStream } from "@/components/dashboard/live-stream";
import type { ModQueueItem } from "@/components/dashboard/mod-queue";
import { ModQueue } from "@/components/dashboard/mod-queue";
import { StatCard } from "@/components/dashboard/stat-card";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { UsersSection } from "@/components/dashboard/users-section";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { useReview, useStats } from "@/hooks";

type DashboardTab = "stats" | "live" | "users" | "channels";

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("stats");
  const { data: stats, isLoading, error, refetch } = useStats();
  const { data: review = [] } = useReview();

  const modQueueItems: ModQueueItem[] = review.slice(0, 10).map((msg) => ({
    id: msg.id,
    content: msg.content || msg.id,
    username: msg.username,
    metadata: msg.metadata ?? null,
    severity:
      msg.ai_severity && msg.ai_severity !== "none"
        ? (msg.ai_severity as ModQueueItem["severity"])
        : "medium",
    reason: msg.ai_analysis ?? "AI moderation flag",
  }));

  const subNavTabs = [
    { id: "stats", label: "Stats", icon: <Hash className="size-3" /> },
    { id: "live", label: "Live", icon: <Sparkles className="size-3" /> },
    { id: "users", label: "Users", icon: <Users className="size-3" /> },
    { id: "channels", label: "Channels", icon: <Hash className="size-3" /> },
  ];

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

              <TopChannelsChart
                data={stats.top_channels.map((c) => ({
                  name: c.channel_name ?? c.channel_id,
                  count: c.message_count,
                }))}
              />
            </>
          )}
        </div>
      )}

      {tab === "live" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LiveStream />
          <ModQueue items={modQueueItems} />
        </div>
      )}

      {tab === "users" && <UsersSection />}

      {tab === "channels" && <ChannelsSection />}
    </div>
  );
}

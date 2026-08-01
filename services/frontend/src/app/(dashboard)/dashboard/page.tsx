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
import { StatCard } from "@/components/dashboard/stat-card";
import { TopChannelsChart } from "@/components/dashboard/top-channels-chart";
import { UsersSection } from "@/components/dashboard/users-section";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { useStats } from "@/hooks";

type DashboardTab = "stats" | "users" | "channels";

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("stats");
  const { data: stats, isLoading, error, mutate: refetch } = useStats();

  const subNavTabs = [
    { id: "stats", label: "Stats", icon: <Hash className="size-3" /> },
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

      {tab === "users" && <UsersSection />}

      {tab === "channels" && <ChannelsSection />}
    </div>
  );
}

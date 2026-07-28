"use client";

import {
  AlertCircle,
  Clock,
  Hash,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { ErrorState, LoadingSkeleton, StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useStats } from "@/hooks";
import { formatNumber } from "@/lib/format";

export function StatsSection() {
  const { data: stats, isLoading, error, refetch } = useStats();
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (isLoading || !stats)
    return (
      <div className="space-y-5 animate-fade-in-up">
        <LoadingSkeleton count={8} height="h-28" columns={4} />
      </div>
    );

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Messages"
          value={stats.total_messages}
          icon={Hash}
        />
        <StatCard label="Today" value={stats.today_messages} icon={Clock} />
        <StatCard label="Users" value={stats.total_users} icon={Users} />
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
        <StatCard
          label="Voice Recordings"
          value={stats.total_voice_recordings}
          icon={Hash}
        />
        <StatCard
          label="AI Profiles"
          value={stats.total_profiles}
          icon={Sparkles}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Hash className="size-4 text-muted-foreground" /> Top Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.top_channels.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No channel data yet.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.top_channels.map((ch) => {
                  const max = stats.top_channels[0].message_count;
                  const pct = max > 0 ? (ch.message_count / max) * 100 : 0;
                  return (
                    <div key={ch.channel_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">
                          #{ch.channel_name ?? ch.channel_id.slice(0, 8)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatNumber(ch.message_count)}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="size-4 text-muted-foreground" /> Moderation
              Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Pending",
                  value: stats.moderation_overview.pending,
                  cls: "bg-muted/50",
                },
                {
                  label: "Processing",
                  value: stats.moderation_overview.processing,
                  cls: "bg-yellow-500/10 text-yellow-500",
                },
                {
                  label: "Errors",
                  value: stats.moderation_overview.error,
                  cls: "bg-destructive/10 text-destructive",
                },
              ].map(({ label, value, cls }) => (
                <div
                  key={label}
                  className={`rounded-lg p-3 text-center space-y-1.5 ${cls}`}
                >
                  <div
                    className={`text-2xl font-bold tabular-nums ${cls.includes("yellow") ? "text-yellow-500" : cls.includes("destructive") ? "text-destructive" : ""}`}
                  >
                    {value}
                  </div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

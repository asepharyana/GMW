"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { dashboardApi, voiceApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LiveStats {
  totalMessages: number | null;
  todayMessages: number | null;
  totalFlagged: number | null;
  totalRecordings: number | null;
  guildCount: number;
  wsConnected: boolean;
}

export function LiveStats() {
  const [stats, setStats] = useState<LiveStats>({
    totalMessages: null,
    todayMessages: null,
    totalFlagged: null,
    totalRecordings: null,
    guildCount: 0,
    wsConnected: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const [dashStats, guilds] = await Promise.all([
          dashboardApi.getStats().catch(() => null),
          voiceApi.getGuilds().catch(() => [] as { id: string }[]),
        ]);
        if (cancelled) return;
        setStats({
          totalMessages: dashStats?.total_messages ?? null,
          todayMessages: dashStats?.today_messages ?? null,
          totalFlagged: dashStats?.total_flagged ?? null,
          totalRecordings: dashStats?.total_voice_recordings ?? null,
          guildCount: guilds.length,
          wsConnected: false,
        });
      } catch (err) {
        console.error("live-stats:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "Messages Captured",
      value: stats.totalMessages ?? "—",
      color: "from-sky-500/20 to-cyan-500/10 border-sky-500/30",
    },
    {
      label: "Today",
      value: stats.todayMessages ?? "—",
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
    },
    {
      label: "Flagged",
      value: stats.totalFlagged ?? "—",
      color: "from-rose-500/20 to-pink-500/10 border-rose-500/30",
    },
    {
      label: "Voice Recordings",
      value: stats.totalRecordings ?? "—",
      color: "from-violet-500/20 to-purple-500/10 border-violet-500/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-xl border bg-gradient-to-br p-4 text-center backdrop-blur-sm",
            item.color,
          )}
        >
          <div className="text-2xl md:text-3xl font-bold tabular-nums tracking-tight">
            {typeof item.value === "number"
              ? item.value.toLocaleString()
              : item.value}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
      <div className="col-span-full text-center mt-2">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          {stats.guildCount > 0
            ? `Monitoring ${stats.guildCount} guild${stats.guildCount > 1 ? "s" : ""}`
            : "Connecting to gateway…"}
        </div>
      </div>
    </div>
  );
}

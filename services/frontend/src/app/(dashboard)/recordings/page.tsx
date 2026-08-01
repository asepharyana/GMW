"use client";

import { Clock, Database, Mic, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SubNav } from "@/components/layout/sub-nav";
import { RecordingCard } from "@/components/recordings/recording-card";
import { RecordingPlayer } from "@/components/recordings/recording-player";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared";
import { useRecordings, useRecordingsWsSync } from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { VoiceRecording } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

type RecordingsTab = "library" | "stats";

export default function RecordingsPage() {
  const {
    data: recordings,
    isLoading,
    error,
    mutate: refetch,
  } = useRecordings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tab, setTab] = useState<RecordingsTab>("library");
  const ws = useWebSocket();

  // Live-update the library when the gateway publishes voice_recording_uploaded
  useRecordingsWsSync(ws);

  const currentTrack =
    playingId && recordings
      ? recordings.find((r: VoiceRecording) => r.id === playingId)
      : null;

  const stats = useMemo(() => {
    const list = recordings ?? [];
    const totalSize = list.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
    const byUser = new Map<
      string,
      { name: string; count: number; size: number }
    >();
    for (const rec of list) {
      const key = rec.user_id ?? rec.username;
      const cur = byUser.get(key) ?? { name: rec.username, count: 0, size: 0 };
      cur.count += 1;
      cur.size += rec.size_bytes ?? 0;
      byUser.set(key, cur);
    }
    const topUsers = [...byUser.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return {
      total: list.length,
      totalSize,
      uniqueUsers: byUser.size,
      topUsers,
    };
  }, [recordings]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={[
          { id: "library", label: "Library", icon: undefined },
          { id: "stats", label: "Stats", icon: undefined },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as RecordingsTab)}
      />

      {tab === "library" &&
        (error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : isLoading ? (
          <LoadingSkeleton count={4} height="h-28" />
        ) : (
          <div className="space-y-2">
            {(recordings ?? []).map((rec: VoiceRecording) => (
              <RecordingCard
                key={rec.id}
                recording={rec}
                onPlay={(id) => setPlayingId(id === playingId ? null : id)}
              />
            ))}
            {(recordings ?? []).length === 0 && (
              <EmptyState
                icon={Mic}
                title="No recordings yet"
                description="Voice recordings will appear here once members speak in a monitored voice channel."
              />
            )}
          </div>
        ))}

      {tab === "stats" &&
        (isLoading ? (
          <LoadingSkeleton count={4} height="h-28" columns={3} />
        ) : stats.total === 0 ? (
          <EmptyState
            icon={Clock}
            title="No recording stats yet"
            description="Recordings are captured from monitored voice channels."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard
                label="Total Recordings"
                value={stats.total}
                icon={Mic}
              />
              <StatCard
                label="Total Size"
                value={stats.totalSize}
                icon={Database}
                formatter={(v) => formatBytes(v)}
              />
              <StatCard
                label="Unique Speakers"
                value={stats.uniqueUsers}
                icon={Users}
              />
            </div>

            {stats.topUsers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-text-secondary font-medium uppercase tracking-wide">
                  Top Speakers
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stats.topUsers.map((u) => (
                    <div
                      key={u.name}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
                    >
                      <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 font-mono text-xs text-primary">
                        {u.count}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm text-text-primary">
                        {u.name}
                      </span>
                      <span className="text-[10px] font-mono text-text-secondary/50">
                        {formatBytes(u.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

      <RecordingPlayer
        url={currentTrack?.download_url ?? undefined}
        filename={currentTrack?.filename ?? undefined}
        onClose={() => setPlayingId(null)}
      />
    </div>
  );
}

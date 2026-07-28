"use client";

import { useState } from "react";
import { RecordingCard } from "@/components/recordings/recording-card";
import { RecordingPlayer } from "@/components/recordings/recording-player";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { useRecordings } from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";

type RecordingsTab = "library" | "stats";

export default function RecordingsPage() {
  const ws = useWebSocket();
  const { data: recordings, isLoading, error, refetch } = useRecordings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tab, setTab] = useState<RecordingsTab>("library");

  const currentTrack = playingId && recordings
    ? recordings.find((r: any) => r.id === playingId)
    : null;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <SubNav
        tabs={[
          { id: "library", label: "Library" },
          { id: "stats", label: "Stats" },
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as RecordingsTab)}
      />

      {tab === "library" && (
        <>
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingSkeleton count={4} height="h-28" />
          ) : (
            <div className="space-y-2">
              {(recordings ?? []).map((rec: any) => (
                <RecordingCard
                  key={rec.id}
                  recording={rec}
                  onPlay={(id) => setPlayingId(id === playingId ? null : id)}
                />
              ))}
              {(recordings ?? []).length === 0 && (
                <div className="py-12 text-center text-sm text-text-secondary/40">No recordings yet</div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "stats" && (
        <div className="py-12 text-center text-sm text-text-secondary/40">Recording stats coming soon</div>
      )}

      <RecordingPlayer url={currentTrack?.download_url} onClose={() => setPlayingId(null)} />
    </div>
  );
}

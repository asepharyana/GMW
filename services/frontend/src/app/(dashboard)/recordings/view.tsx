"use client";

import { Download, Hash, Headphones, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  Button,
  GlassCard,
  GlassPanel,
  Skeleton,
  toast,
} from "@/components/primitives";
import { EmptyState, ErrorState, SectionHeader } from "@/components/shared";
import {
  NowPlayingChip,
  RecordingAudioPlayer,
} from "@/components/voice/recording-audio-player";
import {
  useDeleteRecording,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import type { VoiceRecording } from "@/lib/types";
import { staggerDelay } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function RecordingsView({
  initialItems,
}: {
  initialItems?: VoiceRecording[];
}) {
  const ws = useWebSocket();
  const { data: items, isLoading, error } = useRecordings(initialItems);
  const del = useDeleteRecording();
  useRecordingsWsSync(ws);
  const ambient = useAmbient();
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    ambient.set("signal", 0.3, "recordings");
  }, [ambient]);

  const onDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast({ title: "Recording deleted", tone: "signal" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  if (error && !items) return <ErrorState error={error} />;
  if (!items && isLoading)
    return (
      <GlassPanel>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-9 w-full" />
            </GlassCard>
          ))}
        </div>
      </GlassPanel>
    );

  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="voice captures"
        title="Recordings"
        action={
          <span className="mono text-xs text-ink-faint">
            {(items ?? []).length} clips
          </span>
        }
      />
      {(items ?? []).length === 0 ? (
        <EmptyState
          icon={<Headphones className="size-7" />}
          title="No recordings"
          description="Voice clips captured by the bot appear here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(items ?? []).map((r, i) => {
            const up = uploadStatus(r);
            const isPlaying = playingId === r.id;
            return (
              <GlassCard
                key={r.id}
                className={`animate-stagger flex flex-col gap-3 transition-colors hover:bg-white/[0.06] ${
                  isPlaying
                    ? "border-signal/40 shadow-[0_0_36px_-16px_var(--color-signal-glow)]"
                    : ""
                }`}
                style={staggerDelay(i)}
              >
                <div className="flex items-center gap-3">
                  <Avatar src={r.avatar_url} name={r.username} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">
                      {r.username}
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.65rem] text-ink-faint">
                      <Hash className="size-3" />
                      <span className="truncate">
                        {r.channel_name ?? "voice"}
                      </span>
                      <span className="text-ink-faint/60">·</span>
                      <span className="mono">
                        {formatRelativeTime(r.created_at)}
                      </span>
                    </div>
                  </div>
                  {isPlaying && <NowPlayingChip />}
                  {up && !isPlaying && <Badge tone={up.tone}>{up.label}</Badge>}
                  <span className="mono text-[0.65rem] text-ink-faint">
                    {formatBytes(r.size_bytes)}
                  </span>
                </div>

                {r.download_url ? (
                  <RecordingAudioPlayer
                    src={r.download_url}
                    label={`Voice recording by ${r.username}`}
                    onPlayStateChange={(active) =>
                      setPlayingId((prev) => {
                        if (active) return r.id;
                        // Only clear if THIS card was the one playing.
                        return prev === r.id ? null : prev;
                      })
                    }
                  />
                ) : (
                  <div className="flex items-center gap-1.5 rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-xs text-ink-faint">
                    <Loader2 className="size-3.5 animate-spin" />
                    {r.upload_status === "pending"
                      ? "Upload pending…"
                      : r.upload_error
                        ? r.upload_error
                        : "Processing…"}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {r.download_url && (
                    <a
                      href={r.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-hairline px-2.5 py-1.5 text-xs text-ink-soft hover:text-ink hover:border-signal/40"
                    >
                      <Download className="size-3.5" /> Download
                    </a>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => onDelete(r.id)}
                    disabled={del.isPending}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

function uploadStatus(
  r: VoiceRecording,
): { tone: "neutral" | "amber" | "vermilion"; label: string } | null {
  if (r.download_url) return null;
  if (r.upload_status === "error" || r.upload_error)
    return { tone: "vermilion", label: "failed" };
  if (r.upload_status === "pending") return { tone: "amber", label: "pending" };
  return { tone: "amber", label: "processing" };
}

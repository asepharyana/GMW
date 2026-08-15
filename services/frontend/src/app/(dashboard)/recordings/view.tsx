"use client";

import { Download, Headphones, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Button,
  GlassCard,
  GlassPanel,
  toast,
} from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
} from "@/components/shared";
import {
  useDeleteRecording,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { VoiceRecording } from "@/lib/types";
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
  if (!items && isLoading) return <LoadingState label="Loading clips" />;

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
          {(items ?? []).map((r) => (
            <GlassCard key={r.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={r.avatar_url} name={r.username} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {r.username}
                  </div>
                  <div className="mono text-[0.65rem] text-ink-faint">
                    {r.channel_name ?? "voice"} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="mono text-[0.65rem] text-ink-faint">
                  {formatBytes(r.size_bytes)}
                </span>
              </div>

              {r.download_url ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio
                  controls
                  src={r.download_url}
                  className="h-9 w-full"
                  preload="none"
                  aria-label={`Voice recording ${r.id}`}
                />
              ) : (
                <div className="rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-xs text-ink-faint">
                  Upload pending…
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
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

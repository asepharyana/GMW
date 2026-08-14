"use client";

import { Delete, Download, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Waveform } from "@/components/charts/waveform";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Dialog } from "@/components/primitives/dialog";
import {
  useDeleteRecording,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import type { VoiceRecording } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

interface RecordingsListProps {
  recordings: VoiceRecording[];
  error: Error | null;
  isLoading: boolean;
  deleting: string | null;
  onSelect: (rec: VoiceRecording) => void;
  onDelete: (rec: VoiceRecording) => void;
  preview: VoiceRecording | null;
  onClosePreview: () => void;
}

function RecordingsList({
  recordings,
  error,
  isLoading,
  deleting,
  onSelect,
  onDelete,
  preview,
  onClosePreview,
}: RecordingsListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 surface animate-shimmer" />
        ))}
      </div>
    );
  }
  if (error)
    return (
      <p className="text-sm text-[var(--color-vermilion)]">
        Failed to load: {error.message}
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence>
        {recordings.map((rec) => (
          <StaggerItem key={rec.id} className="surface p-3" layout>
            <motion.div layout className="flex items-center gap-3">
              <Waveform
                seed={rec.id}
                bars={20}
                height={40}
                className="w-20 shrink-0"
              />
              <Avatar name={rec.username} src={rec.avatar_url} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">
                    {rec.username ?? "unknown"}
                  </span>
                  <Badge
                    tone={
                      rec.upload_status === "uploaded"
                        ? "signal"
                        : rec.upload_status === "failed"
                          ? "vermilion"
                          : "amber"
                    }
                  >
                    .{rec.filename.split(".").pop() ?? "mp3"}
                  </Badge>
                </div>
                <div className="mono text-xs text-[var(--color-ink-soft)]">
                  {(rec.size_bytes / 1024).toFixed(0)} KB ·{" "}
                  {new Date(rec.created_at * 1000).toLocaleTimeString()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {rec.download_url && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onSelect(rec)}
                    >
                      <Play className="size-4" />
                    </Button>
                    <a
                      href={rec.download_url}
                      download={rec.filename}
                      aria-label="Download"
                      className="flex size-9 items-center justify-center rounded-[var(--radius-r-control)] text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
                    >
                      <Download className="size-4" />
                    </a>
                  </>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={deleting === rec.id}
                  onClick={() => onDelete(rec)}
                  aria-label="Delete"
                >
                  <Delete className="size-4" />
                </Button>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </AnimatePresence>
      <PreviewDialog
        open={!!preview}
        onClose={onClosePreview}
        recording={preview}
      />
    </div>
  );
}

function PreviewDialog({
  open,
  onClose,
  recording,
}: {
  open: boolean;
  onClose: () => void;
  recording: VoiceRecording | null;
}) {
  if (!recording) return null;
  return (
    <Dialog open={open} onClose={onClose} className="p-6 max-w-xl">
      <div className="space-y-3">
        <div className="display text-lg text-[var(--color-signal)]">
          {recording.filename}
        </div>
        {/* biome-ignore lint/a11y/useMediaCaption: voice recordings are uncaptioned audio previews — no transcript available */}
        <audio
          controls
          src={recording.download_url ?? ""}
          aria-label={`Audio recording: ${recording.filename}`}
          className="w-full"
        />
        <div className="mono text-xs text-[var(--color-ink-soft)]">
          {(recording.size_bytes / 1024).toFixed(0)} KB ·{" "}
          {recording.upload_status}
        </div>
      </div>
    </Dialog>
  );
}

export default function RecordingsView({
  initialRecordings,
}: {
  initialRecordings?: VoiceRecording[];
}) {
  const ws = useWebSocket();
  const {
    data: recordings = [],
    error,
    isLoading,
  } = useRecordings(initialRecordings);
  const del = useDeleteRecording();
  const [deleting, setDeleting] = useState<string | null>(null);
  useRecordingsWsSync(ws);

  const handleDelete = useCallback(
    (rec: VoiceRecording) => {
      setDeleting(rec.id);
      del.mutate(rec.id);
      setTimeout(() => setDeleting(null), 800);
    },
    [del],
  );

  const [preview, setPreview] = useState<VoiceRecording | null>(null);

  return (
    <RecordingsList
      recordings={recordings}
      error={error}
      isLoading={isLoading}
      deleting={deleting}
      onSelect={setPreview}
      onDelete={handleDelete}
      preview={preview}
      onClosePreview={() => setPreview(null)}
    />
  );
}

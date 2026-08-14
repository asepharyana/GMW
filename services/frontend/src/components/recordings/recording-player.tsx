"use client";

/**
 * RecordingPlayer — canonical single-recording row component.
 */
import { Delete, Download, Play } from "lucide-react";
import { Waveform } from "@/components/charts/waveform";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import type { VoiceRecording } from "@/lib/types";

export interface RecordingPlayerProps {
  recording: VoiceRecording;
  onSelect?: (rec: VoiceRecording) => void;
  onDelete?: (rec: VoiceRecording) => void;
  deleting?: boolean;
}

export function RecordingPlayer({
  recording,
  onSelect,
  onDelete,
  deleting,
}: RecordingPlayerProps) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-r)] bg-[var(--color-surface)] p-3">
      <Waveform
        seed={recording.id}
        bars={16}
        height={36}
        className="w-20 shrink-0"
      />
      <Avatar name={recording.username} src={recording.avatar_url} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">
            {recording.username ?? "unknown"}
          </span>
          <Badge tone="neutral">
            .{recording.filename.split(".").pop() ?? "mp3"}
          </Badge>
        </div>
        <div className="mono text-xs text-[var(--color-ink-soft)]">
          {(recording.size_bytes / 1024).toFixed(1)} KB
        </div>
      </div>
      <div className="flex items-center gap-1">
        {recording.download_url && onSelect && (
          <Button size="sm" variant="ghost" onClick={() => onSelect(recording)}>
            <Play className="size-4" />
          </Button>
        )}
        {recording.download_url && (
          <a
            href={recording.download_url}
            download={recording.filename}
            className="flex size-8 items-center justify-center rounded-[var(--radius-r-control)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
            aria-label="Download"
          >
            <Download className="size-4" />
          </a>
        )}
        {onDelete && (
          <Button
            size="sm"
            variant="danger"
            disabled={deleting}
            onClick={() => onDelete(recording)}
            aria-label="Delete"
          >
            <Delete className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

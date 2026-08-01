"use client";

import { useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import type { VoiceRecording } from "@/lib/types";

interface RecordingCardProps {
  recording: VoiceRecording;
  onPlay: (id: string) => void;
}

export function RecordingCard({ recording, onPlay }: RecordingCardProps) {
  const [downloading, setDownloading] = useState(false);
  const durationStr = recording.duration_bytes
    ? `${Math.floor(recording.duration_bytes / 60)}:${String(recording.duration_bytes % 60).padStart(2, "0")}`
    : "--:--";

  // Fetch the file (CORS is open on the uploader) → blob → force download with
  // the real filename. Falls back to opening the URL in a new tab.
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!recording.download_url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(recording.download_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = recording.filename ?? `recording-${recording.id}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
    } catch {
      window.open(recording.download_url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <GlassCard variant="interactive" className="p-4" onClick={() => onPlay(recording.id)}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay(recording.id); }}
          className="size-10 flex items-center justify-center rounded-full glass-elevated shrink-0 hover:scale-105 transition-transform"
        >
          <Play className="size-4 text-primary ml-0.5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-text-primary">{recording.username}</span>
            <span className="text-[10px] text-text-secondary/40 font-mono">{recording.channel_name}</span>
          </div>

          {/* Mini waveform bar */}
          <div className="flex items-end gap-0.5 h-8 my-2">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-primary/60"
                style={{ height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%` }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary/60">{durationStr}</span>
            <span className="text-[10px] text-text-secondary/40">{new Date(recording.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {recording.download_url && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              title="Download"
              className="size-7 flex items-center justify-center rounded glass hover:glass-elevated transition-all disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="size-3 text-text-secondary/60 animate-spin" />
              ) : (
                <Download className="size-3 text-text-secondary/60" />
              )}
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

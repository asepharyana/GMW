"use client";

import { useState } from "react";
import { Download, Loader2, Pause, Play } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import type { VoiceRecording } from "@/lib/types";

interface RecordingCardProps {
  recording: VoiceRecording;
  active: boolean;
  playing: boolean;
  loading: boolean;
  onTogglePlay: (id: string) => void;
}

const BAR_COUNT = 40;
const barBase = (i: number) => 22 + Math.sin(i * 0.45) * 14 + ((i * 7) % 11);

export function RecordingCard({
  recording,
  active,
  playing,
  loading,
  onTogglePlay,
}: RecordingCardProps) {
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
    <GlassCard
      variant="interactive"
      className={`p-4 transition-all ${
        active
          ? "ring-1 ring-primary/40 border-primary/30 animate-card-glow"
          : "hover:ring-1 hover:ring-border/60"
      }`}
      onClick={() => onTogglePlay(recording.id)}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay(recording.id);
          }}
          aria-label={playing ? "Pause" : loading ? "Loading" : "Play"}
          className={`flex size-10 shrink-0 items-center justify-center rounded-full glass-elevated transition-transform hover:scale-105 ${
            active ? "ring-1 ring-primary/50" : ""
          }`}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : playing ? (
            <Pause className="size-4 text-primary" />
          ) : (
            <Play className="size-4 text-primary ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-text-primary">
              {recording.username}
            </span>
            <span className="text-[10px] text-text-secondary/40 font-mono">
              {recording.channel_name}
            </span>
            {active && (
              <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-primary/90">
                {loading
                  ? "Loading"
                  : playing
                    ? "Now Playing"
                    : "Paused"}
              </span>
            )}
          </div>

          {/* Waveform — bounces while playing, pulses while loading */}
          <div className="my-2 flex h-8 items-end gap-0.5 overflow-hidden">
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm transition-colors ${
                  active ? "bg-primary" : "bg-primary/50"
                } ${loading ? "animate-pulse opacity-40" : ""} ${
                  playing ? "animate-eq" : ""
                }`}
                style={{
                  height: `${barBase(i)}%`,
                  animationDelay: playing ? `${(i % 8) * 0.09}s` : undefined,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-text-secondary/60">
              {durationStr}
            </span>
            <span className="text-[10px] text-text-secondary/40">
              {new Date(recording.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          {recording.download_url && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              title="Download"
              className="flex size-7 items-center justify-center rounded glass hover:glass-elevated transition-all disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="size-3 animate-spin text-text-secondary/60" />
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

"use client";

import { useEffect, useRef, useState } from "react";
import { GlassPanel } from "@/components/glass/panel";
import { Loader2, Pause, Play, X } from "lucide-react";

interface RecordingPlayerProps {
  url?: string;
  filename?: string;
  playing: boolean;
  loading: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onToggle: () => void;
  onStateChange: (s: { playing: boolean; loading: boolean }) => void;
  onClose: () => void;
}

export function RecordingPlayer({
  url,
  filename,
  playing,
  loading,
  audioRef,
  onToggle,
  onStateChange,
  onClose,
}: RecordingPlayerProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the track whenever the URL changes; the click that opened the player
  // counts as a user gesture so autoplay is allowed.
  useEffect(() => {
    const audio = audioRef.current;
    if (!url || !audio) return;
    setError(false);
    setProgress(0);
    setDuration(0);
    audio.src = url;
    audio.load();
    const p = audio.play();
    if (p) p.catch(() => {});
  }, [url, audioRef]);

  // Progress ticker + cleanup.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      if (duration === 0 && !Number.isNaN(audio.duration)) setDuration(audio.duration);
      if (!Number.isNaN(audio.currentTime)) setProgress(audio.currentTime);
    }, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [duration, audioRef]);

  if (!url) return null;

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s <= 0) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, "0")}`;
  };
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <GlassPanel dense className="fixed bottom-20 left-4 z-30 w-80 flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={loading}
          title={playing ? "Pause" : "Play"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full glass-elevated transition-transform hover:scale-105 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : playing ? (
            <Pause className="size-3.5 text-primary" />
          ) : (
            <Play className="size-3.5 text-primary ml-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-text-primary">
            {filename ?? "recording"}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-text-secondary/60">
              {fmt(progress)} / {fmt(duration)}
            </span>
            {loading && (
              <span className="text-[10px] text-primary/80">loading…</span>
            )}
            {error && (
              <span className="text-[10px] text-red-400/90">playback failed</span>
            )}
          </div>
        </div>

        <button type="button" onClick={onClose} className="shrink-0">
          <X className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-glass-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Hidden audio element drives everything above. */}
      <audio
        ref={audioRef}
        preload="auto"
        onLoadStart={() => onStateChange({ playing: false, loading: true })}
        onWaiting={() => onStateChange({ playing: false, loading: true })}
        onCanPlay={() => onStateChange({ playing: true, loading: false })}
        onPlaying={() => onStateChange({ playing: true, loading: false })}
        onPlay={() => onStateChange({ playing: true, loading: false })}
        onPause={() => onStateChange({ playing: false, loading: false })}
        onEnded={() => onStateChange({ playing: false, loading: false })}
        onError={() => {
          setError(true);
          onStateChange({ playing: false, loading: false });
        }}
        className="hidden"
      />
    </GlassPanel>
  );
}

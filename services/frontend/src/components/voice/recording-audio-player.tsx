"use client";

import { Loader2, Pause, Play, Signal, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-playback registry: playing one clip pauses every other instance.
 * Module-level so it survives across cards without a context provider.
 */
const activePlayers = new Set<() => void>();
function registerPlayer(pause: () => void): () => void {
  activePlayers.add(pause);
  return () => activePlayers.delete(pause);
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  src: string;
  label?: string;
  /** Lifted state: parent highlights the card that owns the active player. */
  onPlayStateChange?: (playing: boolean) => void;
  className?: string;
}

/**
 * Custom recording player replacing native `<audio controls>`:
 * play/pause with buffering spinner, click-to-seek progress bar, time label,
 * animated equalizer bars while playing, and single-playback enforcement
 * (starting one clip pauses all others).
 */
export function RecordingAudioPlayer({
  src,
  label = "Voice recording",
  onPlayStateChange,
  className,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;

    const onLoadedMeta = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setBuffering(false);
      setCurrent(0);
      audio.currentTime = 0;
    };
    const onPause = () => {
      setPlaying(false);
      setBuffering(false);
    };
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);

    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("durationchange", onLoadedMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("play", onWaiting);
    audio.addEventListener("waiting", onWaiting);

    // Single playback: while this player is active, pause any other that starts.
    const pauseThis = () => audio.pause();
    let unregister: (() => void) | null = null;
    const onPlayEvt = () => {
      for (const other of activePlayers) {
        if (other !== pauseThis) other();
      }
      unregister?.();
      unregister = registerPlayer(pauseThis);
    };
    audio.addEventListener("play", onPlayEvt);

    return () => {
      unregister?.();
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("durationchange", onLoadedMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("play", onWaiting);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("play", onPlayEvt);
      audio.src = "";
      audioRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    onPlayStateChange?.(playing || buffering);
  }, [playing, buffering, onPlayStateChange]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setBuffering(true);
      void audio.play().catch(() => setBuffering(false));
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (e.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * audio.duration;
    setCurrent(audio.currentTime);
  }, []);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-[10px] border bg-white/[0.04] px-3 py-2.5 transition-colors",
        playing || buffering
          ? "border-signal/40 shadow-[0_0_24px_-10px_var(--color-signal-glow)]"
          : "border-hairline",
        className,
      )}
      role="group"
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95",
            playing || buffering
              ? "border-signal/50 bg-signal/15 text-signal"
              : "border-hairline bg-white/5 text-ink-soft hover:border-signal/40 hover:text-ink",
          )}
        >
          {buffering ? (
            <Loader2 className="size-4 animate-spin" />
          ) : playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4 translate-x-[1px]" />
          )}
        </button>

        {/* seekable progress */}
        <div className="min-w-0 flex-1">
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            onClick={seek}
            onKeyDown={(e) => {
              const audio = audioRef.current;
              if (!audio || !Number.isFinite(audio.duration)) return;
              if (e.key === "ArrowRight")
                audio.currentTime = Math.min(
                  audio.duration,
                  audio.currentTime + 5,
                );
              if (e.key === "ArrowLeft")
                audio.currentTime = Math.max(0, audio.currentTime - 5);
            }}
            className="group relative h-4 cursor-pointer"
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  (playing || buffering) && "bg-signal/80",
                  !playing && !buffering && "bg-signal/40",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {(playing || buffering) && (
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_8px_var(--color-signal-glow)] transition-[left]"
                style={{ left: `${pct}%` }}
              />
            )}
          </div>
          <div className="mono mt-1 flex items-center justify-between text-[0.6rem] text-ink-faint">
            <span>{formatTime(current)}</span>
            {/* equalizer bars while playing */}
            {(playing || buffering) && (
              <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={`eq-${i}`}
                    className="w-[3px] animate-eq rounded-full bg-signal"
                    style={{ animationDelay: `${i * 140}ms`, height: "100%" }}
                  />
                ))}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Volume2 className="size-3" />
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small "now playing" chip used by the card header. */
export function NowPlayingChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-[0.6rem] font-medium text-signal">
      <Signal className="size-3 animate-pulse" />
      now playing
    </span>
  );
}

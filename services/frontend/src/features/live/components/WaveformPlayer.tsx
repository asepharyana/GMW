// ─── Waveform Player — audio visualizer with seekable waveform bars ──────────

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "../../../shared/lib/logger";

const logger = createLogger("waveform-player");

const BAR_COUNT = 64;
const SAMPLE_RATE = 24000;

interface WaveformPlayerProps {
  downloadUrl: string;
  filename: string;
}

export function WaveformPlayer({ downloadUrl, filename }: WaveformPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const rafRef = useRef<number>(0);
  const decodedRef = useRef<AudioBuffer | null>(null);
  const durationRef = useRef(0);

  // Decode audio on mount
  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    fetch(downloadUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuffer) => {
        if (cancelled) return;
        decodedRef.current = audioBuffer;
        durationRef.current = audioBuffer.duration;

        // Compute waveform peaks
        const channel = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.floor(channel.length / BAR_COUNT);
        const peakValues: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let max = 0;
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channel.length);
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channel[j]);
            if (abs > max) max = abs;
          }
          // Clamp so silent sections still show a tiny bar
          peakValues.push(Math.max(0.01, max));
        }
        setPeaks(peakValues);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Failed to decode audio", { error: msg });
        setError(msg);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ctx.close();
    };
  }, [downloadUrl]);

  // Draw waveform on canvas whenever peaks change or while playing
  const drawWaveform = useCallback(
    (progress = 0) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 64 * dpr;
      canvas.style.height = "64px";

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, 64);

      if (peaks.length === 0) return;

      const barWidth = rect.width / peaks.length;
      const barGap = Math.max(1, barWidth * 0.15);
      const barActualWidth = barWidth - barGap;
      const progressPixel = rect.width * progress;

      for (let i = 0; i < peaks.length; i++) {
        const x = i * barWidth;
        const height = Math.max(2, peaks[i] * 50);
        const y = 32 - height / 2;

        // Color: played vs unplayed
        const isPlayed = x + barWidth <= progressPixel;
        ctx.fillStyle = isPlayed ? "#23a1eb" : "#334155";
        ctx.fillRect(x, y, barActualWidth, height);
      }
    },
    [peaks],
  );

  // Initial draw when peaks change
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Animation loop while playing
  useEffect(() => {
    if (!playing || !decodedRef.current) return;

    const tick = () => {
      const elapsed =
        audioContextRef.current!.currentTime - startTimeRef.current;
      const progress = (elapsed + startOffsetRef.current) / durationRef.current;
      drawWaveform(Math.min(1, Math.max(0, progress)));

      if (progress >= 1) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawWaveform]);

  const handleTogglePlay = useCallback(() => {
    const ctx = audioContextRef.current;
    const buffer = decodedRef.current;
    if (!ctx || !buffer) return;

    if (playing) {
      // Pause
      if (sourceRef.current) {
        startOffsetRef.current += ctx.currentTime - startTimeRef.current;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      setPlaying(false);
      return;
    }

    // Resume / start
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0, startOffsetRef.current);
    startTimeRef.current = ctx.currentTime;
    sourceRef.current = source;
    setPlaying(true);

    source.onended = () => {
      if (sourceRef.current === source) {
        setPlaying(false);
        sourceRef.current = null;
      }
    };
  }, [playing]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!decodedRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      const offset = progress * durationRef.current;

      const ctx = audioContextRef.current;
      if (ctx && sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
      }

      startOffsetRef.current = offset;
      startTimeRef.current = ctx?.currentTime ?? 0;
      drawWaveform(progress);

      if (playing && ctx) {
        const buffer = decodedRef.current;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0, offset);
        startTimeRef.current = ctx.currentTime;
        sourceRef.current = source;
        source.onended = () => {
          if (sourceRef.current === source) {
            setPlaying(false);
            sourceRef.current = null;
          }
        };
      }
    },
    [playing, drawWaveform],
  );

  if (loading) {
    return (
      <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
    );
  }

  if (error) {
    return (
      <div className="h-16 w-full rounded-md bg-destructive/10 flex items-center justify-center text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (peaks.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleTogglePlay}
        className="shrink-0 rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div
        ref={containerRef}
        className="relative flex-1 cursor-pointer"
        onClick={handleSeek}
        role="slider"
        aria-label={`Playback seek for ${filename}`}
        tabIndex={0}
      >
        <canvas ref={canvasRef} className="w-full" />
      </div>
    </div>
  );
}

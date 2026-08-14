"use client";

import { Pause, Play, Repeat2, SkipForward, Square, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Waveform } from "@/components/charts/waveform";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Progress } from "@/components/primitives/progress";
import {
  useMediaLoop,
  useMediaQueue,
  useMediaSkip,
  useMediaState,
  useMediaStop,
  useMediaWsSync,
} from "@/hooks";
import type { MediaState } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export default function MediaView({
  initialStatus,
}: {
  initialStatus?: MediaState;
}) {
  const ws = useWebSocket();
  const { data: state } = useMediaState(initialStatus);
  const queueMut = useMediaQueue();
  const skip = useMediaSkip();
  const stop = useMediaStop();
  const loopMut = useMediaLoop();
  useMediaWsSync(ws);

  const current = state?.current;
  const playing = state?.playing ?? false;
  const queue = state?.queue ?? [];
  const loop = state?.loop ?? false;

  const duration = current?.durationMs ?? 0;
  const [queueUrl, setQueueUrl] = useState("");
  const [screenMode, setScreenMode] = useState(false);

  const handleQueue = () => {
    if (!queueUrl.trim()) return;
    queueMut.mutate({ url: queueUrl.trim(), mode: screenMode ? "screen" : "music" });
    setQueueUrl("");
  };

  return (
    <div className="flex flex-col gap-5">
      {/* URL queue input */}
      <div className="flex gap-2">
        <Input
          placeholder="Queue a URL (YouTube, audio file…)"
          value={queueUrl}
          onChange={(e) => setQueueUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQueue()}
          className="flex-1 h-9"
        />
        <Button
          size="sm"
          variant={screenMode ? "primary" : "ghost"}
          onClick={() => setScreenMode((v) => !v)}
          title="Queue as Discord GoLive screenshare instead of audio playback"
        >
          Screen
        </Button>
        <Button
          size="sm"
          onClick={handleQueue}
          disabled={!queueUrl.trim() || queueMut.isPending}
        >
          <Play className="size-4 mr-1.5" />
          Queue
        </Button>
      </div>

      {/* Turntable hero */}
      <div className="flex items-center gap-6 surface scan-tick flex-wrap p-5">
        {current && (
          <motion.div
            className={`relative mx-auto size-[160px] rounded-full ${
              playing ? "animate-spin-disc" : "animate-spin-disc paused"
            }`}
          >
            <img
              src={current.thumbnailUrl ?? "/favicon.ico"}
              alt={current.title ?? "cover"}
              className="size-full rounded-full object-cover ring-4 ring-[var(--color-signal)]/20"
              style={{ animationPlayState: playing ? "running" : "paused" }}
            />
          </motion.div>
        )}
        <div className="min-w-0 flex-1">
          <div className="display text-2xl text-[var(--color-signal)]">
            {current?.title ?? "No track playing"}
          </div>
          <div className="mt-1 mono text-xs text-[var(--color-ink-soft)]">
            {current?.source ?? "idle"} · {duration ? formatMs(duration) : "—"}
          </div>
          <div className="mt-3">
            <Progress value={42} max={100} tone="signal" />
            <div className="mt-1 flex justify-between text-[10px] mono text-[var(--color-ink-soft)]">
              <span>0:00</span>
              <span>{duration ? formatMs(duration) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transport */}
      <StaggerGroup className="flex items-center gap-2">
        <StaggerItem>
          <Button size="sm" variant="ghost" onClick={() => skip.mutate()}>
            <SkipForward className="size-4" />
          </Button>
        </StaggerItem>
        <StaggerItem>
          <Button
            size="icon"
            variant="primary"
            onClick={() => loopMut.mutate(!loop)}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
        </StaggerItem>
        <StaggerItem>
          <Button size="sm" variant="ghost" onClick={() => stop.mutate()}>
            <Square className="size-4" />
          </Button>
        </StaggerItem>
        <StaggerItem>
          <Button
            size="sm"
            variant={loop ? "primary" : "ghost"}
            onClick={() => loopMut.mutate(!loop)}
          >
            <Repeat2 className="size-4" />
          </Button>
        </StaggerItem>
        <StaggerItem>
          <Volume2 className="size-4 text-[var(--color-ink-soft)]" />
        </StaggerItem>
      </StaggerGroup>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="surface flex flex-col gap-1.5 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Queue ({queue.length})</h3>
            <Badge tone="neutral">{loop ? "loop" : "queue"}</Badge>
          </div>
          <div className="flex flex-col gap-1">
            {queue.map((item) => (
              <motion.div
                key={item.id ?? item.source}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2.5 rounded-[var(--radius-r-control)] px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
              >
                <Waveform
                  seed={item.id ?? item.source}
                  bars={12}
                  height={20}
                  className="w-16"
                />
                <span className="mono truncate">{item.title}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

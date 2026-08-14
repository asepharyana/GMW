"use client";

import { Pause, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { Progress } from "@/components/primitives/progress";

export interface ListenControlProps {
  listening: boolean;
  onToggle: (on: boolean) => void;
  volume: number;
  onVolume: (v: number) => void;
}

export function ListenControl({
  listening,
  onToggle,
  volume,
  onVolume,
}: ListenControlProps) {
  return (
    <div className="surface flex items-center gap-3 p-4">
      <Button
        size="icon"
        variant={listening ? "danger" : "primary"}
        onClick={() => onToggle(!listening)}
        aria-pressed={listening}
      >
        {listening ? <Pause className="size-5" /> : <Play className="size-5" />}
      </Button>
      <div className="flex items-center gap-2 flex-1">
        <Volume2 className="size-4 text-[var(--color-ink-soft)]" />
        <Progress
          value={volume}
          max={100}
          tone={listening ? "signal" : undefined}
          className="flex-1 h-1"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          aria-label="Volume"
          className="w-24 accent-[var(--color-signal)]"
        />
      </div>
      <span className="mono text-xs text-[var(--color-ink-soft)]">
        {listening ? `${volume}%` : "off"}
      </span>
    </div>
  );
}

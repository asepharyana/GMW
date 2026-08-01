"use client";

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import { Button } from "@/components/ui/button";
import { hashUserId } from "@/hooks";
import type { ActiveSpeaker } from "@/lib/types";
import { Headphones, HeadphoneOff } from "lucide-react";

interface ListenControlProps {
  connected: boolean;
  active: boolean;
  levels: Map<number, number>;
  speakers: ActiveSpeaker[];
  onToggle: (active: boolean) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

/** Live bar for one speaker — level 0..1 from the PCM player. */
function SpeakerLevel({
  speaker,
  level,
}: {
  speaker: ActiveSpeaker;
  level: number;
}) {
  const [bars, setBars] = useState<number[]>(Array(24).fill(0.06));

  useEffect(() => {
    const id = setInterval(() => {
      setBars((prev) => {
        const next = [...prev];
        for (let i = 0; i < next.length; i++) {
          const target = level > 0.004 ? level * 0.9 + 0.08 : 0.05;
          next[i] = next[i] + (target - next[i]) * 0.35;
        }
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, [level]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-[11px] text-text-secondary">
        {speaker.username}
      </span>
      <div className="flex flex-1 items-end gap-[2px] h-6">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-primary/70 transition-[height]"
            style={{ height: `${Math.max(6, h * 100)}%` }}
          />
        ))}
      </div>
      <span className="w-8 text-right font-mono text-[10px] text-text-secondary/50">
        {Math.round(level * 100)}%
      </span>
    </div>
  );
}

export function ListenControl({
  connected,
  active,
  levels,
  speakers,
  onToggle,
  volume,
  onVolumeChange,
}: ListenControlProps) {
  const activeLevels = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of speakers) {
      const lvl = levels.get(hashUserId(s.userId)) ?? 0;
      map.set(s.userId, lvl);
    }
    return map;
  }, [speakers, levels]);

  const talking = useMemo(
    () => [...activeLevels.values()].some((l) => l > 0.004),
    [activeLevels],
  );

  return (
    <GlassCard variant="base">
      <div className="flex items-center gap-3">
        <Button
          variant={active ? "default" : "secondary"}
          size="sm"
          onClick={() => onToggle(!active)}
          disabled={!connected}
          className="h-9"
        >
          {active ? (
            <Headphones className="size-4 mr-1" />
          ) : (
            <HeadphoneOff className="size-4 mr-1" />
          )}
          {active ? "Listening" : "Listen"}
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] text-text-secondary/60 font-mono">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-1 appearance-none bg-glass-border rounded-full accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px] [&::-webkit-slider-thumb]:shadow-primary/60"
          />
          <span className="text-[10px] font-mono text-text-secondary w-8 text-right">
            {volume}%
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {active && speakers.length > 0 ? (
          speakers.map((s) => (
            <SpeakerLevel
              key={s.userId}
              speaker={s}
              level={activeLevels.get(s.userId) ?? 0}
            />
          ))
        ) : (
          <span className="text-[11px] text-text-secondary/40">
            {!connected
              ? "Connect to a voice channel first."
              : active
                ? "Listening for Discord voice…"
                : "Toggle Listen to hear Discord voice."}
          </span>
        )}
        {active && talking && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-primary/80">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 live-pulse-ring" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            live
          </span>
        )}
      </div>
    </GlassCard>
  );
}

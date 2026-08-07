"use client";

import { Mic, MicOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ActiveSpeaker } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityTimelineProps {
  data?: ActiveSpeaker[];
}

/**
 * Voice Activity — live view of everyone currently in the monitored voice
 * channel and whether they are speaking right now.
 *
 * Previously this rendered a Recharts bar chart fed from a `{user, duration}`
 * prop that NO caller ever supplied, so the Activity tab always showed an
 * empty, misleading chart. It now renders real live speaker state from the
 * WebSocket (same source as the Connection tab's waveform).
 */
export function VoiceActivityTimeline({ data = [] }: ActivityTimelineProps) {
  const sorted = [...data].sort((a, b) =>
    a.speaking === b.speaking
      ? String(a.username).localeCompare(b.username)
      : a.speaking
        ? -1
        : 1,
  );

  return (
    <Card className={cn("[--card-spacing:0px]", "rounded-2xl", "p-5")}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Voice Activity
        </span>
        <span className="text-[10px] text-text-secondary/50 ml-auto">
          {sorted.length} speaker{sorted.length !== 1 ? "s" : ""} · live
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MicOff className="size-8 text-text-secondary/30 mb-2" />
          <p className="text-xs text-text-secondary/60">
            No speakers in the monitored voice channel.
          </p>
          <p className="mt-1 text-[10px] text-text-secondary/40">
            Connect to a voice channel to see live activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((s) => (
            <div
              key={s.userId}
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
            >
              {s.speaking ? (
                <Mic className="size-3.5 text-primary shrink-0" />
              ) : (
                <MicOff className="size-3.5 text-text-secondary/40 shrink-0" />
              )}
              <span
                className={`truncate text-sm ${
                  s.speaking
                    ? "text-text-primary font-medium"
                    : "text-text-secondary/70"
                }`}
              >
                {s.username}
              </span>
              <span
                className={`ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-widest ${
                  s.speaking ? "text-primary" : "text-text-secondary/40"
                }`}
              >
                {s.speaking ? "Speaking" : "Listening"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

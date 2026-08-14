"use client";

import { Mic, MicOff } from "lucide-react";
import type { ActiveSpeaker } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActivityTimelineProps {
  data?: ActiveSpeaker[];
}

export function VoiceActivityTimeline({ data = [] }: ActivityTimelineProps) {
  const sorted = [...data].sort((a, b) =>
    a.speaking === b.speaking
      ? String(a.username).localeCompare(b.username)
      : a.speaking
        ? -1
        : 1,
  );

  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide uppercase text-[var(--color-ink-soft)]">
          Voice Activity
        </span>
        <span className="text-[10px] text-[var(--color-ink-soft)] ml-auto">
          {sorted.length} speaker{sorted.length !== 1 ? "s" : ""} · live
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MicOff className="size-8 text-[var(--color-ink-soft)] mb-2" />
          <p className="text-xs text-[var(--color-ink-soft)]">
            No speakers in the monitored voice channel.
          </p>
          <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">
            Connect to a voice channel to see live activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((s) => (
            <div
              key={s.userId}
              className="flex items-center gap-2 rounded-[var(--radius-r-panel)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              {s.speaking ? (
                <Mic className="size-3.5 text-[var(--color-signal)] shrink-0" />
              ) : (
                <MicOff className="size-3.5 text-[var(--color-ink-soft)] shrink-0" />
              )}
              <span
                className={cn(
                  "truncate text-sm",
                  s.speaking
                    ? "text-[var(--color-ink)] font-medium"
                    : "text-[var(--color-ink-soft)]",
                )}
              >
                {s.username}
              </span>
              <span
                className={cn(
                  "ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-widest",
                  s.speaking
                    ? "text-[var(--color-signal)]"
                    : "text-[var(--color-ink-soft)]",
                )}
              >
                {s.speaking ? "Speaking" : "Listening"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

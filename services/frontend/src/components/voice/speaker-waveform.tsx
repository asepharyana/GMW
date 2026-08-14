"use client";

import { Avatar } from "@/components/primitives/avatar";
import type { ActiveSpeaker } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SpeakerWaveform({ speakers }: { speakers: ActiveSpeaker[] }) {
  if (speakers.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)]">
        No active speakers
      </div>
    );
  }
  return (
    <div className="flex items-end gap-1.5 rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] px-3 py-2">
      {speakers.map((s) => (
        <div key={s.userId} className="flex flex-col items-center gap-1">
          <Avatar src={s.avatar} name={s.username} size={28} />
          <div className="flex items-end gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "w-0.5 rounded-t-[2px] bg-[var(--color-signal)] transition-[height]",
                  s.speaking ? "h-3 animate-eq" : "h-1 opacity-30",
                )}
                style={
                  s.speaking ? { animationDelay: `${i * 0.08}s` } : undefined
                }
              />
            ))}
          </div>
          <span className="mono text-[9px] text-[var(--color-ink-soft)]">
            {s.username.split(/[\s.#]/)[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

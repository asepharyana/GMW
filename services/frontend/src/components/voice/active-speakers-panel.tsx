"use client";

import { useMemo } from "react";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import type { ActiveSpeaker } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ActiveSpeakersPanelProps {
  speakers: ActiveSpeaker[];
}

export function ActiveSpeakersPanel({ speakers }: ActiveSpeakersPanelProps) {
  const sorted = useMemo(
    () => [...speakers].sort((a, b) => Number(b.speaking) - Number(a.speaking)),
    [speakers],
  );

  if (sorted.length === 0) {
    return (
      <div className="surface p-5 text-center text-sm text-[var(--color-ink-soft)]">
        No speakers in range.
      </div>
    );
  }

  return (
    <div className="surface divide-y divide-[var(--color-hairline)] overflow-hidden">
      <div className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
        Active speakers ({sorted.length})
      </div>
      <div className="flex flex-col">
        {sorted.map((s) => (
          <div
            key={s.userId}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 transition-colors",
              s.speaking && "bg-[var(--color-signal)]/5",
            )}
          >
            <div className="relative">
              <Avatar src={s.avatar} name={s.username} size={34} />
              {s.speaking && (
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-[var(--color-signal)] ring-2 ring-[var(--color-canvas)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{s.username}</span>
                {s.speaking ? (
                  <Badge tone="signal">speaking</Badge>
                ) : (
                  <Badge tone="neutral">idle</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

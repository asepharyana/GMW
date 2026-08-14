"use client";

import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

export interface MicControlProps {
  micOn: boolean;
  onToggle: (on: boolean) => void;
  levels: Map<number, number>;
}

export function MicControl({ micOn, onToggle, levels }: MicControlProps) {
  return (
    <div className="surface flex items-center gap-3 p-4">
      <Button
        size="icon"
        variant={micOn ? "primary" : "danger"}
        onClick={() => onToggle(!micOn)}
        aria-pressed={micOn}
      >
        {micOn ? <MicOff className="size-5" /> : <Mic className="size-5" />}
      </Button>
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-[var(--color-ink-soft)]">
            {micOn ? "Mic active" : "Mic muted"}
          </span>
          <span className="mono text-[var(--color-ink-soft)]">
            {levels.size > 0 ? `${levels.size} active` : "ready"}
          </span>
        </div>
        <div className="flex items-end gap-0.5 h-5">
          {Array.from(levels.entries())
            .slice(0, 10)
            .map(([uid, level]) => (
              <div
                key={uid}
                className={cn(
                  "w-0.5 rounded-t-[2px] bg-[var(--color-signal)] transition-[height]",
                  micOn ? "h-4" : "h-1 opacity-30",
                )}
                style={{ height: micOn ? `${level * 16}px` : "4px" }}
              />
            ))}
          {Array.from({ length: Math.max(0, 10 - levels.size) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="w-0.5 opacity-15 h-1 rounded-[2px] bg-[var(--color-ink-soft)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

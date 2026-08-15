"use client";

import { useWebSocket } from "@/lib/ws/context";
import { Tooltip } from "@/components/primitives/tooltip";
import { cn } from "@/lib/utils";

const MAP = {
  connected: { color: "bg-signal", label: "Live link" },
  connecting: { color: "bg-amber animate-breathe", label: "Connecting…" },
  disconnected: { color: "bg-ink-faint", label: "Offline" },
  error: { color: "bg-vermilion", label: "Link error" },
} as const;

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { status } = useWebSocket();
  const s = MAP[status];
  return (
    <Tooltip label={s.label}>
      <span className="inline-flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-ring", s.color)} />
          <span className={cn("relative inline-flex size-2.5 rounded-full", s.color)} />
        </span>
        {!compact && (
          <span className="mono text-[0.7rem] uppercase tracking-wider text-ink-soft">
            {s.label}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

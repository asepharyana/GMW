"use client";

/**
 * EventRow — single row in the horizontal event-feed timeline.
 *
 * No card chrome. The row is a single typographic line: mono timestamp,
 * severity dot, actor mention, action verb, channel jump, excerpt.
 *
 * Hover reveals full excerpt and selection state; click toggles selection
 * so the right rail / command line can target the event.
 */

import { type ReactNode, useCallback } from "react";
import { cn } from "@/lib/utils";

export type EventSeverity = "neutral" | "signal" | "amber" | "vermilion";

export interface FeedEvent {
  /** Stable id from the upstream record. Used as React key. */
  id: string;
  /** Unix epoch ms. */
  ts: number;
  /** Severity tone — drives dot color and zebra fill. */
  severity: EventSeverity;
  /** Display label for the actor ("alice", "@everyone", "Carl-bot"). */
  actor: string;
  /** Verb describing the action ("sent", "flagged", "joined", "muted"). */
  action: string;
  /** Channel reference (monogram display only — no chrome). */
  channel?: string | null;
  /** Message excerpt or action payload text. Truncated when long. */
  excerpt: string;
  /** Optional metadata tag (e.g. "ai:flag", "voice:join"). */
  tag?: string | null;
}

interface EventRowProps {
  event: FeedEvent;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const SEVERITY_DOT: Record<EventSeverity, string> = {
  neutral: "oklch(0.46 0.02 70)",
  signal: "var(--color-signal)",
  amber: "var(--color-amber)",
  vermilion: "var(--color-vermilion)",
};

const SEVERITY_FILL: Record<EventSeverity, string> = {
  neutral: "transparent",
  signal: "oklch(0.78 0.17 125 / 0.06)",
  amber: "oklch(0.80 0.15 70 / 0.07)",
  vermilion: "oklch(0.62 0.21 25 / 0.08)",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function EventRow({ event, selected, onSelect }: EventRowProps) {
  const handleClick = useCallback(() => {
    onSelect?.(event.id);
  }, [event.id, onSelect]);

  const dot: ReactNode = (
    <span
      aria-hidden
      className="inline-block size-1.5 shrink-0 rounded-full"
      style={{ background: SEVERITY_DOT[event.severity] }}
    />
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative flex w-full items-baseline gap-3 px-3 py-1.5 text-left font-mono text-[12px] leading-5 transition-colors",
        "hover:bg-[oklch(0.92_0.014_80_/_0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-signal)] focus-visible:outline-offset-[-2px]",
        selected && "bg-[oklch(0.92_0.014_80_/_0.8)]",
      )}
      style={{
        background: selected ? undefined : SEVERITY_FILL[event.severity],
      }}
      data-event-id={event.id}
      data-severity={event.severity}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[2px] origin-center transition-transform",
          selected ? "scale-y-100" : "scale-y-0 group-hover:scale-y-100",
        )}
        style={{ background: SEVERITY_DOT[event.severity] }}
      />

      <span className="w-[68px] shrink-0 text-[var(--color-ink-soft)] tabular-nums">
        {formatTimestamp(event.ts)}
      </span>

      {dot}

      <span className="w-[120px] shrink-0 truncate text-[var(--color-ink)]">
        {event.actor}
      </span>

      <span className="w-[80px] shrink-0 text-[var(--color-ink-soft)]">
        {event.action}
      </span>

      {event.channel ? (
        <span className="w-[140px] shrink-0 truncate text-[var(--color-ink-soft)]">
          {event.channel}
        </span>
      ) : (
        <span className="w-[140px] shrink-0" aria-hidden />
      )}

      <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">
        {event.excerpt}
      </span>

      {event.tag ? (
        <span className="shrink-0 rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] px-1.5 py-px text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
          {event.tag}
        </span>
      ) : null}
    </button>
  );
}

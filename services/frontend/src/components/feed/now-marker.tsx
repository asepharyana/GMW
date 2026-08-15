"use client";

/**
 * NowMarker — inline callout that breaks the feed timeline rhythm.
 *
 * Two variants: `pulse` (one-line summary) and `cluster` (horizontal stack bar
 * visualising severity distribution across a recent window). Both use a
 * border-tip on the left in signal tone; no card chrome, no shadow.
 */

import { cn } from "@/lib/utils";

type Tone = "signal" | "amber" | "vermilion" | "neutral";

interface PulseMarkerProps {
  tone?: Tone;
  label: string;
  timestamp: number;
  /** Optional small caps label on the right. */
  trailing?: string;
}

interface ClusterMarkerProps {
  tone?: Tone;
  label: string;
  timestamp: number;
  /** Fractions of each severity band; must sum to 1. */
  bands: { tone: Tone; ratio: number }[];
}

const TONE_TIP: Record<Tone, string> = {
  signal: "var(--color-signal)",
  amber: "var(--color-amber)",
  vermilion: "var(--color-vermilion)",
  neutral: "oklch(0.46 0.02 70)",
};

const TONE_FILL: Record<Tone, string> = {
  signal: "oklch(0.78 0.17 125 / 0.12)",
  amber: "oklch(0.80 0.15 70 / 0.14)",
  vermilion: "oklch(0.62 0.21 25 / 0.12)",
  neutral: "oklch(0.46 0.02 70 / 0.08)",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function MarkerShell({
  tone,
  label,
  timestamp,
  trailing,
  children,
}: {
  tone: Tone;
  label: string;
  timestamp: number;
  trailing?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative my-2 flex items-center gap-3 px-3 py-2 font-mono text-[11px]"
      style={{ background: TONE_FILL[tone] }}
      data-marker={tone}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-0 w-[3px]"
        style={{ background: TONE_TIP[tone] }}
      />
      <span className="w-[68px] shrink-0 text-[var(--color-ink-soft)] tabular-nums">
        {formatTimestamp(timestamp)}
      </span>
      <span
        className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em]"
        style={{ color: TONE_TIP[tone] }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">
        {children}
      </span>
      {trailing ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export function PulseMarker({
  tone = "signal",
  label,
  timestamp,
  trailing,
}: PulseMarkerProps) {
  return (
    <MarkerShell
      tone={tone}
      label={label}
      timestamp={timestamp}
      trailing={trailing}
    >
      {/* children rendered by parent via composition — see NowMarker union below */}
    </MarkerShell>
  );
}

export function ClusterMarker({
  tone = "signal",
  label,
  timestamp,
  bands,
}: ClusterMarkerProps) {
  return (
    <MarkerShell tone={tone} label={label} timestamp={timestamp}>
      <div className="flex h-3 w-full max-w-[280px] overflow-hidden rounded-[var(--radius-r-control)]">
        {bands.map((b) => (
          <span
            key={b.tone}
            className={cn("h-full")}
            style={{
              width: `${Math.max(0, Math.min(1, b.ratio)) * 100}%`,
              background: TONE_TIP[b.tone],
              opacity: b.tone === "neutral" ? 0.4 : 1,
            }}
            aria-hidden
          />
        ))}
      </div>
    </MarkerShell>
  );
}

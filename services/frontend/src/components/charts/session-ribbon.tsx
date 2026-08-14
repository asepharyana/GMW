"use client";

import { cn } from "@/lib/utils";

export interface RibbonSegment {
  id: string;
  label: string;
  value: number; // relative duration
  tone?: "signal" | "amber" | "vermilion" | "neutral";
}

const toneClass = {
  signal: "bg-[var(--color-signal)]",
  amber: "bg-[var(--color-amber)]",
  vermilion: "bg-[var(--color-vermilion)]",
  neutral: "bg-[var(--color-ink-soft)]/40",
};

export interface SessionRibbonProps {
  segments: RibbonSegment[];
  className?: string;
  height?: number;
}

export function SessionRibbon({
  segments,
  className,
  height = 28,
}: SessionRibbonProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div
      className={cn(
        "flex w-full gap-0.5 overflow-hidden rounded-[var(--radius-r-control)]",
        className,
      )}
      style={{ height }}
    >
      {segments.map((s) => (
        <div
          key={s.id}
          className={cn(
            "group relative flex items-center justify-center rounded-sm transition-all",
            toneClass[s.tone ?? "signal"],
          )}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={`${s.label}: ${s.value}`}
        >
          <span className="pointer-events-none absolute inset-x-0 -top-6 hidden whitespace-nowrap rounded bg-[var(--color-ink)] px-1.5 py-0.5 text-[10px] text-[var(--color-canvas)] group-hover:block">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

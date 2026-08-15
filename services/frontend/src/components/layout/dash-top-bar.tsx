"use client";

/**
 * DashTopBar — 48px utility strip.
 *
 * No navigation chrome — just brand monogram, guild indicator, WS connection
 * state, clock, and focus mode. Designed to read as a single line of
 * instrument readout, not a navbar.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

type FocusMode = "quiet" | "standard" | "triage";
const FOCUS_MODES: FocusMode[] = ["quiet", "standard", "triage"];

interface DashTopBarProps {
  guildName: string;
  botName?: string;
}

function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function DashTopBar({ guildName, botName = "GMW" }: DashTopBarProps) {
  const ws = useWebSocket();
  const [now, setNow] = useState<Date | null>(null);
  const [focus, setFocus] = useState<FocusMode>("standard");
  const [tz, setTz] = useState<"utc" | "local">("local");

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const connected = ws.status === "connected";

  return (
    <header
      className={cn(
        "flex h-12 items-center justify-between gap-4 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 font-mono text-[11px]",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="display text-base font-medium text-[var(--color-ink)]">
          {botName}
        </span>
        <span className="text-[var(--color-ink-soft)]">·</span>
        <span className="text-[var(--color-ink-soft)]">{guildName}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "inline-block size-1.5 rounded-full",
              connected
                ? "bg-[var(--color-signal)]"
                : "bg-[var(--color-vermilion)]",
            )}
            style={{
              boxShadow: connected
                ? "0 0 0 0 oklch(from var(--color-signal) l c h / 0.45)"
                : "none",
            }}
          />
          <span className="uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            {ws.status}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setTz((t) => (t === "utc" ? "local" : "utc"))}
          className="rounded-[var(--radius-r-control)] px-2 py-0.5 text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          aria-label="Toggle UTC / local timezone"
        >
          {now
            ? tz === "utc"
              ? `${formatClock(now)} UTC`
              : formatLocal(now)
            : "--:--:--"}
        </button>

        <div className="flex gap-0.5 rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] p-0.5">
          {FOCUS_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFocus(m)}
              className={cn(
                "rounded-[var(--radius-r-control)] px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                focus === m
                  ? "bg-[var(--color-canvas)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

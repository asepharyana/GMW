"use client";

/**
 * Dashboard — Ambient Field layout.
 *
 * No top bar. No side rail. No grid. No panels.
 *
 * A full-bleed WebGL haze (AmbientField) is the page. Content floats over it:
 * a giant headline bottom-left, a live metric cluster top-right, a drifting
 * event ribbon mid-screen, a command whispher at the very bottom. Whitespace
 * is the layout — density comes from data, not chrome.
 */

import { useCallback, useMemo, useState } from "react";
import { AmbientField } from "@/components/ambient/ambient-field";
import { DashCommandLine } from "@/components/command/dash-command-line";
import type { DashboardActivity, DashboardStats } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export default function DashboardView({
  initialStats,
  initialActivity,
}: {
  initialStats?: DashboardStats;
  initialActivity?: DashboardActivity;
}) {
  const ws = useWebSocket();
  const [signal, setSignal] = useState<
    "signal" | "amber" | "vermilion" | "neutral"
  >("signal");
  const [load, setLoad] = useState(0.3);

  const total = initialStats?.total_messages ?? 0;
  const clean = initialStats?.total_clean ?? 0;
  const flagged = initialStats?.total_flagged ?? 0;
  const warned = initialStats?.total_warned ?? 0;
  const ratio = ((clean / (clean + flagged + warned || 1)) * 100).toFixed(1);

  const _subscribe = useCallback(
    (handler: (e: { severity: string; ts: number }) => void) => {
      const unsub = ws.on("message_created", (data: any) => {
        const s = data.ai_status;
        setSignal(
          s === "flagged" ? "vermilion" : s === "warn" ? "amber" : "signal",
        );
        setLoad((l) => Math.min(1, l + 0.02));
        handler({
          severity: s ?? "neutral",
          ts: data.created_at ?? Date.now(),
        });
      });
      return unsub;
    },
    [ws],
  );

  const seedEvents = useMemo(() => {
    if (!initialActivity) return [];
    return initialActivity.daily.slice(-10).flatMap((d) =>
      Array.from({ length: Math.min(3, d.messages) }, (_, i) => ({
        id: `seed-${d.day}-${i}`,
        ts: Date.now() - i * 120_000,
        severity: i < d.flagged ? "vermilion" : "signal",
        actor: i < d.flagged ? "ai" : "user",
        action: i < d.flagged ? "flagged" : "sent",
        channel: "#general",
        excerpt: `seed ${d.day}`,
      })),
    );
  }, [initialActivity]);

  return (
    <div className="relative h-[calc(100svh-3rem)] w-full overflow-hidden bg-[var(--color-canvas)]">
      <AmbientField load={load} signal={signal} />

      {/* Metric cluster — top right, floating, no container */}
      <div className="absolute right-6 top-6 flex flex-col items-end gap-1 font-mono text-right">
        <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-ink-soft)]">
          watched
        </span>
        <span className="display text-5xl font-medium tabular-nums leading-none text-[var(--color-ink)]">
          {total.toLocaleString()}
        </span>
        <div className="mt-2 flex gap-4 text-[12px]">
          <span className="text-[var(--color-signal)]">
            {clean.toLocaleString()} clean
          </span>
          <span className="text-[var(--color-amber)]">{warned} warn</span>
          <span className="text-[var(--color-vermilion)]">{flagged} flag</span>
        </div>
        <span className="text-[10px] text-[var(--color-ink-soft)]">
          {ratio}% ratio
        </span>
      </div>

      {/* Headline — bottom left, massive */}
      <div className="absolute bottom-20 left-6 max-w-[60vw]">
        <h1 className="display text-[clamp(3rem,9vw,7rem)] font-medium leading-[0.95] tracking-tight text-[var(--color-ink)]">
          GMW
          <br />
          Console
        </h1>
        <p className="mt-3 font-mono text-[12px] text-[var(--color-ink-soft)]">
          {(initialStats?.total_users ?? 0).toLocaleString()} users ·{" "}
          {initialStats?.active_users_24h ?? 0} active 24h
        </p>
      </div>

      {/* Event ribbon — mid screen, drifting row */}
      <div className="absolute left-1/2 top-1/2 w-[min(90vw,900px)] -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {seedEvents.slice(0, 6).map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 opacity-70"
              data-severity={e.severity}
            >
              <span
                className="inline-block size-1.5 rounded-full"
                style={{
                  background:
                    e.severity === "vermilion"
                      ? "var(--color-vermilion)"
                      : "var(--color-signal)",
                }}
              />
              <span className="text-[var(--color-ink-soft)] tabular-nums">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              <span className="truncate text-[var(--color-ink)]">
                {e.excerpt}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Command whisper — very bottom, minimal */}
      <div className="absolute inset-x-0 bottom-0">
        <DashCommandLine />
      </div>
    </div>
  );
}

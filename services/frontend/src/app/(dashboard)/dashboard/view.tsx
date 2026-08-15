"use client";

/**
 * Dashboard — Event Horizon layout.
 *
 * Renders inside `ConsoleShell` from `/(dashboard)/layout.tsx`, so this view
 * just paints the central column: hero strip (mono headline + counters) and
 * the live event feed. Time runs vertically through the feed; the right
 * rail lives in the shell. The bottom command line is the signature —
 * press `/` anywhere to focus.
 *
 * SSR seed is preserved: the server component (page.tsx) hands us
 * `initialActivity` and `initialStats`; we use activity's daily buckets as
 * synthetic seed events so the feed has something to render before WS
 * kicks in. Then WS subscribe replaces the stream with live messages.
 */

import { useCallback, useMemo } from "react";
import { DashCommandLine } from "@/components/command/dash-command-line";
import { EventFeed } from "@/components/feed/event-feed";
import type { FeedEvent } from "@/components/feed/event-row";
import { DashRightRail } from "@/components/layout/dash-right-rail";
import type { DashboardActivity, DashboardStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export default function DashboardView({
  initialStats,
  initialActivity,
}: {
  initialStats?: DashboardStats;
  initialActivity?: DashboardActivity;
}) {
  const ws = useWebSocket();

  const seedEvents = useMemo<FeedEvent[]>(() => {
    if (!initialActivity) return [];
    // Map daily buckets aren't per-message; derive a synthetic sequence from
    // daily counts so the feed has something to render before WS kicks in.
    const out: FeedEvent[] = [];
    const ts = Date.now();
    const days = [...initialActivity.daily].reverse();
    for (const d of days) {
      const total = d.messages;
      const flagged = d.flagged ?? 0;
      for (let i = 0; i < Math.min(6, total); i++) {
        const flaggedRow = i < flagged;
        out.push({
          id: `seed-${d.day ?? ""}-${i}`,
          ts: ts - i * 90_000,
          severity: flaggedRow ? "vermilion" : "signal",
          actor: flaggedRow ? "ai-moderator" : `seed-user-${i + 1}`,
          action: flaggedRow ? "flagged" : "sent",
          channel: `#general`,
          excerpt: flaggedRow
            ? `seed: synthetic flagged event (${d.day ?? ""})`
            : `seed: synthetic clean message (${d.day ?? ""})`,
          tag: flaggedRow ? "ai:flag" : null,
        });
      }
    }
    return out.slice(-48).reverse();
  }, [initialActivity]);

  const subscribe = useCallback(
    (handler: (e: FeedEvent) => void) => {
      const unsub = ws.on("message_created", (data) => {
        const m = data as unknown as {
          id: string;
          created_at: number;
          ai_status?: string | null;
          ai_severity?: string | null;
          username?: string;
          content: string;
          channel_id?: string;
        };
        handler({
          id: m.id,
          ts: m.created_at ?? Date.now(),
          severity: severityFromAi(m.ai_status, m.ai_severity),
          actor: m.username ?? "unknown",
          action: "sent",
          channel: m.channel_id ? `#${m.channel_id.slice(-4)}` : null,
          excerpt: (m.content ?? "").slice(0, 140),
          tag:
            m.ai_status && m.ai_status !== "clean" ? `ai:${m.ai_status}` : null,
        });
      });
      return unsub;
    },
    [ws],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Hero stats={initialStats} />
        <div className="flex min-h-0 flex-1 flex-col">
          <EventFeed
            initialEvents={seedEvents}
            subscribe={subscribe}
            className={cn("min-h-0 flex-1")}
            emptyState={
              <span>
                waiting for the first signal …
                <br />
                events will stream in as the bot captures activity.
              </span>
            }
          />
          <DashCommandLine />
        </div>
      </div>
      <DashRightRail />
    </div>
  );
}

function severityFromAi(
  status?: string | null,
  sev?: string | null,
): FeedEvent["severity"] {
  if (!status) return "neutral";
  if (status === "flagged") return sev === "critical" ? "vermilion" : "amber";
  if (status === "warn") return "amber";
  if (status === "clean") return "signal";
  return "neutral";
}

function Hero({ stats }: { stats?: DashboardStats }) {
  const total = stats?.total_messages ?? 0;
  const flagged = stats?.total_flagged ?? 0;
  const warned = stats?.total_warned ?? 0;
  const clean = stats?.total_clean ?? 0;
  const denom = clean + flagged + warned || 1;
  const ratio = clean / denom;

  return (
    <div className="border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-5 py-4 font-mono">
      <div className="flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h1 className="display text-[28px] font-medium leading-tight text-[var(--color-ink)]">
            GMW Console
          </h1>
          <p className="mt-1 text-[12px] text-[var(--color-ink-soft)]">
            <span className="tabular-nums">{total.toLocaleString()}</span>{" "}
            messages watched ·{" "}
            <span className="tabular-nums">
              {(stats?.total_users ?? 0).toLocaleString()}
            </span>{" "}
            users ·{" "}
            <span className="tabular-nums">{stats?.active_users_24h ?? 0}</span>{" "}
            active 24h
          </p>
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-1 text-[11px] uppercase tracking-[0.18em]">
          <Stat label="clean" value={clean} tone="signal" />
          <Stat label="warned" value={warned} tone="amber" />
          <Stat label="flagged" value={flagged} tone="vermilion" />
          <Stat
            label="ratio"
            value={`${(ratio * 100).toFixed(1)}%`}
            tone="neutral"
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "signal" | "amber" | "vermilion" | "neutral";
}) {
  const color =
    tone === "signal"
      ? "var(--color-signal)"
      : tone === "amber"
        ? "var(--color-amber)"
        : tone === "vermilion"
          ? "var(--color-vermilion)"
          : "var(--color-ink)";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--color-ink-soft)]">{label}</span>
      <span className="tabular-nums text-base" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

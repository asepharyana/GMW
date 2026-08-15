"use client";

/**
 * DashRightRail — 320px collapsible drawer.
 *
 * Holds the live AI verdict stream, active voice speakers, and the latest
 * moderation actions. Reads from existing hooks (`useVoice`, etc.) — no
 * new fetches; just re-presentation.
 */

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useSpeakers } from "@/hooks/use-voice";
import type { ActiveSpeaker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

interface DashRightRailProps {
  pendingVerdicts?: { id: string; ts: number; text: string }[];
  recentActions?: { id: string; ts: number; verb: string; target: string }[];
}

export function DashRightRail({
  pendingVerdicts = [],
  recentActions = [],
}: DashRightRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { subscribe } = useSpeakers();
  const ws = useWebSocket();
  const [speakers, _setSpeakers] = useState<ActiveSpeaker[]>([]);
  useEffect(() => subscribe(ws), [ws, subscribe]);

  return (
    <aside
      className={cn(
        "relative shrink-0 border-l border-[var(--color-hairline)] bg-[var(--color-surface)] font-mono text-[11px] transition-[width]",
        collapsed ? "w-9" : "w-[320px]",
      )}
      aria-label="Live activity rail"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "absolute -left-3 top-3 z-10 flex size-6 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]",
        )}
        aria-label={
          collapsed
            ? "Expand live activity rail"
            : "Collapse live activity rail"
        }
      >
        <ChevronRight
          className={cn(
            "size-3 transition-transform",
            collapsed ? "" : "rotate-180",
          )}
        />
      </button>

      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-4 py-4">
          <Section title="ai" vertical />
          <Section title="voice" vertical />
          <Section title="mod" vertical />
        </div>
      ) : (
        <div className="flex h-full flex-col overflow-y-auto">
          <Section title="ai verdicts">
            {pendingVerdicts.length === 0 ? (
              <Empty msg="no pending verdicts" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pendingVerdicts.slice(0, 8).map((v) => (
                  <li key={v.id} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[var(--color-ink-soft)] tabular-nums">
                      {formatTs(v.ts)}
                    </span>
                    <span className="min-w-0 truncate text-[var(--color-ink)]">
                      {v.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="voice">
            {speakers.length === 0 ? (
              <Empty msg="no one speaking" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {speakers.slice(0, 8).map((sp) => (
                  <li key={sp.userId} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block size-1.5 rounded-full",
                        sp.speaking
                          ? "bg-[var(--color-signal)]"
                          : "bg-[var(--color-ink-soft)]",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[var(--color-ink)]">
                      {sp.username ?? sp.userId}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="mod queue">
            {recentActions.length === 0 ? (
              <Empty msg="queue empty" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recentActions.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[var(--color-ink-soft)] tabular-nums">
                      {formatTs(a.ts)}
                    </span>
                    <span className="text-[var(--color-ink-soft)]">
                      {a.verb}
                    </span>
                    <span className="min-w-0 truncate text-[var(--color-ink)]">
                      {a.target}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="socket">
            <div className="flex flex-col gap-0.5 text-[10px]">
              <span className="text-[var(--color-ink-soft)]">status</span>
              <span className="text-[var(--color-ink)]">{ws.status}</span>
            </div>
          </Section>
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  children,
  vertical,
}: {
  title: string;
  children?: React.ReactNode;
  vertical?: boolean;
}) {
  return (
    <section
      className={cn(
        "border-b border-[var(--color-hairline)] px-3 py-2.5",
        vertical && "flex flex-col items-center gap-2 border-b-0 py-4",
      )}
    >
      <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <span className="text-[10px] italic text-[var(--color-ink-soft)]">
      {msg}
    </span>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

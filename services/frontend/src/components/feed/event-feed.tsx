"use client";

/**
 * EventFeed — horizontal scroll-snap timeline that ingests live events.
 *
 * The feed is the central column of the dashboard. Time runs left → right
 * (older → newer). New events append at the right edge; the feed scrolls
 * right when the user is at the live edge and pauses when the user drags
 * back to inspect history.
 *
 * Ring buffer keeps the DOM bounded (200 items). A `NowMarker` is inserted
 * every 10 events or every 30 seconds to break the row rhythm with a pulse
 * summary — see `useFeedPulse`.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EventRow, type FeedEvent } from "@/components/feed/event-row";
import { ClusterMarker, PulseMarker } from "@/components/feed/now-marker";
import { cn } from "@/lib/utils";

const RING_BUFFER_MAX = 200;
const PULSE_EVERY_N_EVENTS = 10;
const PULSE_EVERY_MS = 30_000;

export type FeedItem =
  | { kind: "event"; event: FeedEvent }
  | {
      kind: "pulse";
      key: string;
      ts: number;
      label: string;
      summary: string;
      tone?: "signal" | "amber" | "vermilion";
    }
  | {
      kind: "cluster";
      key: string;
      ts: number;
      label: string;
      bands: {
        tone: "neutral" | "signal" | "amber" | "vermilion";
        ratio: number;
      }[];
      tone?: "signal" | "amber" | "vermilion";
    };

interface EventFeedProps {
  initialEvents: FeedEvent[];
  subscribe: (handler: (e: FeedEvent) => void) => () => void;
  className?: string;
  emptyState?: ReactNode;
}

export function EventFeed({
  initialEvents,
  subscribe,
  className,
  emptyState,
}: EventFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(() =>
    injectMarkers(initialEvents.slice(-RING_BUFFER_MAX)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastPulseAt = useRef<number>(Date.now());

  // Live WS ingest
  useEffect(() => {
    const unsub = subscribe((e) => {
      setItems((prev) => appendWithMarker(prev, e));
    });
    return unsub;
  }, [subscribe]);

  // Periodic pulse even if traffic is slow — keeps the feed rhythm alive.
  useEffect(() => {
    const id = window.setInterval(() => {
      setItems((prev) => {
        if (Date.now() - lastPulseAt.current < PULSE_EVERY_MS) return prev;
        return appendPulse(prev, "system", "live · standing by");
      });
    }, PULSE_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);

  // Auto-scroll on append when following.
  useEffect(() => {
    if (!following) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [following]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distFromRight = el.scrollWidth - el.scrollLeft - el.clientWidth;
    setFollowing(distFromRight < 24);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const visibleItems = useMemo(() => {
    if (items.length <= RING_BUFFER_MAX) return items;
    return items.slice(items.length - RING_BUFFER_MAX);
  }, [items]);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        "border-t border-[var(--color-hairline)]",
        className,
      )}
      data-following={following ? "1" : "0"}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
        <span>event horizon</span>
        <span>
          {visibleItems.filter((i) => i.kind === "event").length} events ·{" "}
          {following ? "live" : "paused"}
        </span>
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className={cn(
          "h-[calc(100%-30px)] overflow-y-auto overflow-x-hidden",
          "snap-y snap-mandatory",
          "scroll-pt-2",
        )}
        role="feed"
        aria-live="polite"
      >
        {visibleItems.length === 0 && emptyState ? (
          <div className="flex h-full items-center justify-center p-8 text-center font-mono text-[12px] text-[var(--color-ink-soft)]">
            {emptyState}
          </div>
        ) : (
          visibleItems.map((item) => {
            if (item.kind === "event") {
              return (
                <div key={item.event.id} className="snap-start">
                  <EventRow
                    event={item.event}
                    selected={selectedId === item.event.id}
                    onSelect={handleSelect}
                  />
                </div>
              );
            }
            if (item.kind === "cluster") {
              return (
                <div key={item.key} className="snap-start">
                  <ClusterMarker
                    label={item.label}
                    timestamp={item.ts}
                    bands={item.bands}
                    tone={item.tone}
                  />
                </div>
              );
            }
            return (
              <div key={item.key} className="snap-start">
                <PulseMarker
                  label={item.label}
                  timestamp={item.ts}
                  trailing={item.summary}
                  tone={item.tone}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Ring + pulse helpers ────────────────────────────────────────

function injectMarkers(events: FeedEvent[]): FeedItem[] {
  if (events.length === 0) return [];
  const out: FeedItem[] = [];
  let count = 0;
  for (const e of events) {
    out.push({ kind: "event", event: e });
    count++;
    if (count % PULSE_EVERY_N_EVENTS === 0) {
      out.push({
        kind: "cluster",
        key: `cluster-${e.id}`,
        ts: e.ts,
        label: "pulse",
        bands: deriveBands(
          events.slice(Math.max(0, count - PULSE_EVERY_N_EVENTS), count),
        ),
        tone: "signal",
      });
    }
  }
  return out;
}

function deriveBands(
  window: FeedEvent[],
): { tone: "neutral" | "signal" | "amber" | "vermilion"; ratio: number }[] {
  const counts: Record<"neutral" | "signal" | "amber" | "vermilion", number> = {
    neutral: 0,
    signal: 0,
    amber: 0,
    vermilion: 0,
  };
  for (const e of window) counts[e.severity]++;
  const total = window.length || 1;
  return (Object.keys(counts) as Array<keyof typeof counts>).map((k) => ({
    tone: k,
    ratio: counts[k] / total,
  }));
}

function appendWithMarker(prev: FeedItem[], e: FeedEvent): FeedItem[] {
  const next = [...prev, { kind: "event" as const, event: e }];
  const eventsSinceLastPulse = next.filter((i) => i.kind === "event").length;
  if (eventsSinceLastPulse % PULSE_EVERY_N_EVENTS === 0) {
    const recentEvents = next
      .filter((i) => i.kind === "event")
      .slice(-PULSE_EVERY_N_EVENTS)
      .map((i) => (i as { kind: "event"; event: FeedEvent }).event);
    next.push({
      kind: "cluster",
      key: `cluster-${e.id}`,
      ts: e.ts,
      label: "pulse",
      bands: deriveBands(recentEvents),
      tone: "signal",
    });
  }
  if (next.length > RING_BUFFER_MAX * 2) {
    return next.slice(next.length - RING_BUFFER_MAX);
  }
  return next;
}

function appendPulse(
  prev: FeedItem[],
  label: string,
  summary: string,
): FeedItem[] {
  return [
    ...prev,
    {
      kind: "pulse",
      key: `pulse-${Date.now()}`,
      ts: Date.now(),
      label,
      summary,
      tone: "signal",
    },
  ];
}

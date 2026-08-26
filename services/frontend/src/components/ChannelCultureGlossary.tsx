"use client";

import { Activity, Download, Hash } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { ChannelCultureRow } from "@/lib/types";

function deriveSignalStrength(c: ChannelCultureRow): number {
  let score = 0.3;
  if (c.culture_summary) {
    score += Math.min(0.45, c.culture_summary.length / 350);
  }
  if (c.last_analyzed_at) {
    const ageMs = Date.now() - c.last_analyzed_at;
    const days = ageMs / (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.25 - days * 0.015);
  }
  return Math.max(0.12, Math.min(1, score));
}

export function ChannelCultureGlossary({
  cultures,
}: {
  cultures: ChannelCultureRow[];
}) {
  const [filter, setFilter] = useState("");

  const ranked = useMemo(() => {
    return cultures
      .map((c) => ({ c, signal: deriveSignalStrength(c) }))
      .sort((a, b) => b.signal - a.signal);
  }, [cultures]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return ranked;
    const q = filter.toLowerCase();
    return ranked.filter(
      ({ c }) =>
        c.channel_name?.toLowerCase().includes(q) ||
        c.channel_id.toLowerCase().includes(q) ||
        c.culture_summary?.toLowerCase().includes(q),
    );
  }, [ranked, filter]);

  const containerRef = useStaggerReveal<HTMLDivElement>(".channel-node-card", {
    stagger: 0.03,
    y: 10,
    dependencies: [filtered.length, filter],
  });

  return (
    <div className="space-y-4">
      {/* Search and Quick Filters */}
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Hash className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Filter channels or culture topics..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-[6px] border border-hairline bg-surface-2 py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          {cultures.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "channel-cultures.csv",
                  cultures.map((c) => ({
                    channel: c.channel_name ?? c.channel_id,
                    summary: c.culture_summary ?? "",
                    last_analyzed: c.last_analyzed_at ?? "",
                  })),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <Download className="size-3.5 text-signal" />
              EXPORT_CSV
            </button>
          )}
        </div>
      </GlassPanel>

      {/* Channel Nodes Grid */}
      <GlassPanel>
        <SectionHeader
          eyebrow="Roster Telemetry"
          title="Channel Culture & Activity Spectrum"
          action={
            <span className="mono text-xs text-ink-faint">
              {filtered.length} of {cultures.length} channels
            </span>
          }
        />

        {filtered.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-ink-faint">
            NO MATCHING CHANNEL TELEMETRY FOUND
          </div>
        ) : (
          <div
            ref={containerRef}
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map(({ c, signal }) => {
              const pct = Math.round(signal * 100);
              const isHighSignal = signal > 0.65;
              return (
                <div
                  key={c.channel_id}
                  className="channel-node-card hud-card group relative flex flex-col justify-between overflow-hidden p-4"
                >
                  <div>
                    {/* Channel Card Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex size-6 items-center justify-center rounded bg-surface-2 text-signal">
                          <Hash className="size-3.5" />
                        </span>
                        <span className="truncate font-mono text-xs font-semibold text-ink">
                          {c.channel_name ?? c.channel_id.slice(0, 10)}
                        </span>
                      </div>
                      <Badge
                        tone={isHighSignal ? "signal" : "neutral"}
                        className="font-mono text-[10px]"
                      >
                        {pct}% SIGNAL
                      </Badge>
                    </div>

                    {/* Culture Summary */}
                    <div className="mt-3">
                      {c.culture_summary ? (
                        <p className="font-sans text-xs text-ink-soft leading-relaxed line-clamp-3">
                          {c.culture_summary}
                        </p>
                      ) : (
                        <p className="font-mono text-[11px] text-ink-faint italic">
                          Awaiting AI culture profile synthesis...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Signal Strength Bar & Timestamp */}
                  <div className="mt-4 pt-3 border-t border-hairline">
                    <div className="flex items-center justify-between font-mono text-[10px] text-ink-faint mb-1.5">
                      <span className="flex items-center gap-1">
                        <Activity className="size-3 text-signal" />
                        INTEL RATIO
                      </span>
                      <span>
                        {c.last_analyzed_at
                          ? formatRelativeTime(c.last_analyzed_at)
                          : "NEVER"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-signal transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

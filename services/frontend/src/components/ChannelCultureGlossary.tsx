"use client";

import { Radio, Signal } from "lucide-react";
import { useMemo } from "react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { ChannelCultureRow } from "@/lib/types";

/**
 * Deterministic pseudo signal-strength (0..1) derived from recency + summary
 * richness — purely cosmetic telemetry framing, no backend field for this.
 */
function deriveSignalStrength(c: ChannelCultureRow): number {
  let score = 0.25;
  if (c.culture_summary) {
    score += Math.min(0.45, c.culture_summary.length / 400);
  }
  if (c.last_analyzed_at) {
    const ageMs = Date.now() - c.last_analyzed_at;
    const days = ageMs / (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.3 - days * 0.02);
  }
  return Math.max(0.08, Math.min(1, score));
}

export function ChannelCultureGlossary({
  cultures,
}: {
  cultures: ChannelCultureRow[];
}) {
  const ranked = useMemo(
    () =>
      cultures
        .map((c) => ({ c, signal: deriveSignalStrength(c) }))
        .sort((a, b) => b.signal - a.signal),
    [cultures],
  );

  const hudRef = useStaggerReveal<HTMLDivElement>(".channel-node", {
    stagger: 0.045,
    y: 14,
    dependencies: [cultures],
  });

  return (
    <GlassPanel className="lg:col-span-3">
      <SectionHeader
        eyebrow="knowledge · roster"
        title={
          <span className="flex items-center gap-2">
            <Radio className="size-4 text-signal" />
            Channel Culture Glossary
          </span>
        }
        action={
          cultures.length > 0 ? (
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
              className="flex items-center gap-1.5 font-mono text-[11px] text-ink-soft hover:text-ink"
            >
              EXPORT_CSV
            </button>
          ) : null
        }
      />
      {cultures.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-ink-faint">
          NO CHANNEL TELEMETRY CAPTURED YET
        </p>
      ) : (
        <div ref={hudRef} className="space-y-2">
          {ranked.map(({ c, signal }) => (
            <div
              key={c.channel_id}
              className="channel-node group relative overflow-hidden rounded-md border border-hairline bg-surface/40 p-3 backdrop-blur-md transition-colors hover:border-signal/40"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-xs font-semibold text-ink">
                  #{c.channel_name ?? c.channel_id.slice(0, 8)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <Signal className="size-3 text-ink-faint" />
                  {c.last_analyzed_at && (
                    <span className="font-mono text-[10px] text-ink-faint">
                      {formatRelativeTime(c.last_analyzed_at)}
                    </span>
                  )}
                </div>
              </div>

              {c.culture_summary ? (
                <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-soft">
                  {c.culture_summary}
                </p>
              ) : (
                <span className="mt-1.5 block font-mono text-[11px] text-ink-faint">
                  (no summary captured)
                </span>
              )}

              {/* Signal strength readout bar */}
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-canvas-2">
                <div
                  className="h-full rounded-full bg-signal transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.round(signal * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

"use client";

import { Radio, Signal } from "lucide-react";
import { useMemo } from "react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { ChannelCultureRow } from "@/lib/types";

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

  const containerRef = useStaggerReveal<HTMLDivElement>(".channel-row", {
    stagger: 0.025,
    y: 6,
    dependencies: [cultures],
  });

  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="Roster Intelligence"
        title="Channel Culture & Activity Roster"
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
              className="font-mono text-[11px] text-[#8a8f98] transition-colors hover:text-[#f7f8f8]"
            >
              EXPORT_CSV
            </button>
          ) : null
        }
      />
      {cultures.length === 0 ? (
        <div className="py-8 text-center font-mono text-xs text-[#8a8f98]">
          NO CHANNELS LOGGED
        </div>
      ) : (
        <div ref={containerRef} className="space-y-2 mt-3">
          {ranked.map(({ c }) => (
            <div
              key={c.channel_id}
              className="channel-row flex flex-col gap-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#f7f8f8]">
                  #{c.channel_name ?? c.channel_id.slice(0, 8)}
                </span>
                {c.last_analyzed_at && (
                  <span className="font-mono text-[10px] text-[#8a8f98]">
                    {formatRelativeTime(c.last_analyzed_at)}
                  </span>
                )}
              </div>
              {c.culture_summary && (
                <p className="font-sans text-xs text-[#8a8f98] leading-relaxed line-clamp-2">
                  {c.culture_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

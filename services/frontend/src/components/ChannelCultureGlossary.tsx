"use client";

import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { ChannelCultureRow } from "@/lib/types";

export function ChannelCultureGlossary({
  cultures,
}: {
  cultures: ChannelCultureRow[];
}) {
  return (
    <GlassPanel className="lg:col-span-3">
      <SectionHeader
        eyebrow="culture"
        title="Channel Culture Glossary"
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
              className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
            >
              CSV
            </button>
          ) : null
        }
      />
      {cultures.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No channel cultures captured yet.
        </p>
      ) : (
        <div className="space-y-3">
          {cultures.map((c) => (
            <div key={c.channel_id} className="text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-ink">
                  {c.channel_name ?? c.channel_id}
                </span>
                {c.last_analyzed_at && (
                  <span className="text-xs text-ink-faint">
                    {formatRelativeTime(c.last_analyzed_at)}
                  </span>
                )}
              </div>
              {c.culture_summary ? (
                <p className="mt-1 text-ink-faint">{c.culture_summary}</p>
              ) : (
                <span className="text-xs text-ink-faint">
                  (no summary captured)
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

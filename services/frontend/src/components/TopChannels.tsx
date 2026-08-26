"use client";

import { Download } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatNumber } from "@/lib/format";
import type { FlaggedChannel } from "@/lib/types";

export function TopChannels({ channels }: { channels: FlaggedChannel[] }) {
  const max = channels.reduce((m, c) => Math.max(m, c.flagged_count), 0);
  return (
    <GlassPanel className="lg:col-span-2">
      <SectionHeader
        eyebrow="channels"
        title="Top Flagged Channels"
        action={
          channels.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "flagged-channels.csv",
                  channels.map((c) => ({
                    channel_id: c.channel_id,
                    channel_name: c.channel_name ?? "",
                    flagged_count: c.flagged_count,
                  })),
                )
              }
              className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
            >
              <Download className="size-3.5" />
              CSV
            </button>
          ) : null
        }
      />
      {channels.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No flagged activity in the selected period.
        </p>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => {
            const pct =
              max > 0 ? Math.max(2, (c.flagged_count / max) * 100) : 0;
            return (
              <div
                key={c.channel_id}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-40 shrink-0 truncate text-ink-soft">
                  {c.channel_name ?? c.channel_id}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-amber"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="mono w-10 shrink-0 text-right text-ink">
                  {formatNumber(c.flagged_count)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

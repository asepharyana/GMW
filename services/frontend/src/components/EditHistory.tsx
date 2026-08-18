"use client";

import { Download, History } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { EditHistoryRow } from "@/lib/types";

export function EditHistory({ edits }: { edits: EditHistoryRow[] }) {
  return (
    <GlassPanel className="lg:col-span-4">
      <SectionHeader
        eyebrow="evasion"
        title="Message Edits"
        action={
          edits.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "message-edits.csv",
                  edits.map((e) => ({
                    author: e.username ?? "",
                    channel: e.channel_name ?? "",
                    old_content: e.old_content,
                    edited_at: e.edited_at,
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
      {edits.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No edited messages recorded recently.
        </p>
      ) : (
        <div className="space-y-3">
          {edits.map((e) => (
            <div key={e.id} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">
                  {e.username ?? "unknown"}
                </span>
                <span className="text-xs text-ink-faint">
                  edited {formatRelativeTime(e.edited_at)} ·{" "}
                  {e.channel_name ?? e.channel_id ?? "unknown channel"}
                </span>
              </div>
              <div className="mt-1 flex items-start gap-1.5">
                <History className="mt-0.5 size-3.5 shrink-0 text-ink-faint/50" />
                <pre className="line-clamp-2 whitespace-pre-wrap break-words text-ink-faint/80">
                  {e.old_content || <em>(content not available)</em>}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

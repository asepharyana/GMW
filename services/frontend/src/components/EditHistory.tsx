"use client";

import { ArrowRight, Download, History } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { EditHistoryRow } from "@/lib/types";

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);

  return (
    <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-hairline bg-surface-2/50 text-[11px] leading-relaxed">
      {/* Before */}
      <div className="min-w-0 overflow-hidden rounded-l-[5px] border-r border-hairline">
        <div className="flex items-center gap-1.5 border-b border-hairline bg-vermilion/5 px-2.5 py-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-vermilion">
            Before
          </span>
        </div>
        <div className="max-h-24 overflow-y-auto p-2">
          {oldLines.length === 0 || (oldLines.length === 1 && !oldLines[0]) ? (
            <span className="italic text-ink-faint">(empty)</span>
          ) : (
            oldLines.map((line, i) => (
              <div
                key={`o-${i}`}
                className="whitespace-pre-wrap break-words text-ink-faint/80"
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>

      {/* After */}
      <div className="min-w-0 overflow-hidden rounded-r-[5px]">
        <div className="flex items-center gap-1.5 border-b border-hairline bg-success/5 px-2.5 py-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-success">
            After
          </span>
        </div>
        <div className="max-h-24 overflow-y-auto p-2">
          {newLines.length === 0 || (newLines.length === 1 && !newLines[0]) ? (
            <span className="italic text-ink-faint">(empty)</span>
          ) : (
            newLines.map((line, i) => (
              <div
                key={`n-${i}`}
                className="whitespace-pre-wrap break-words text-ink-soft"
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

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
                    new_content: e.new_content,
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
        <div className="space-y-4">
          {edits.map((e) => (
            <div key={e.id} className="space-y-2">
              {/* Header row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">
                  {e.username ?? "unknown"}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                  <History className="size-3 text-ink-faint/50" />
                  edited {formatRelativeTime(e.edited_at)}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-faint">
                  {e.channel_name ?? e.channel_id ?? ""}
                </span>
              </div>

              {/* Before / After diff */}
              <DiffBlock oldText={e.old_content} newText={e.new_content} />
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

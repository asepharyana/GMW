"use client";

import { Avatar } from "@/components/primitives/avatar";
import { renderMessageContent } from "@/lib/format";
import type { AiSeverity, MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiStatusBadge, SeverityTick } from "./ai-status-badge";

function fmtTime(ts?: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const severityColor: Record<NonNullable<AiSeverity>, string> = {
  none: "text-[var(--color-ink-soft)]",
  low: "text-[var(--color-amber)]",
  medium: "text-[var(--color-amber)]",
  high: "text-orange-500",
  critical: "text-[var(--color-vermilion)]",
};

export interface MessageEntryProps {
  message: MessageRecord;
  selected: boolean;
  onSelect: () => void;
  onAvatarClick?: () => void;
}

export function MessageEntry({
  message: msg,
  selected,
  onSelect,
}: MessageEntryProps) {
  const severity = (msg.ai_severity ?? "none") as AiSeverity;
  const status = msg.ai_status ?? null;

  return (
    <button
      type="button"
      data-selected={selected}
      onClick={onSelect}
      className={cn(
        "group relative mb-1.5 flex w-full items-start gap-2.5 rounded-[var(--radius-r)] p-2.5 text-left cursor-pointer",
        "transition-all hover:bg-[var(--color-surface-2)]",
        selected && "bg-[var(--color-signal)]/6",
      )}
    >
      <SeverityTick severity={severity} />
      <Avatar src={msg.avatar_url} name={msg.username} size={32} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{msg.username}</span>
          <span className="text-xs text-[var(--color-ink-soft)] mono">
            {fmtTime(msg.created_at)}
          </span>
          {status && <AiStatusBadge status={status} />}
          {severity !== "none" && (
            <span
              className={cn(
                "text-[10px] font-bold uppercase",
                severityColor[severity],
              )}
            >
              {severity}
            </span>
          )}
        </div>
        <div className="text-sm leading-relaxed">
          {msg.deleted_at ? (
            <span className="italic text-[var(--color-ink-soft)]">
              message deleted
            </span>
          ) : (
            renderMessageContent(
              msg.edited_content ?? msg.content,
              msg.metadata,
            )
          )}
        </div>
      </div>
    </button>
  );
}

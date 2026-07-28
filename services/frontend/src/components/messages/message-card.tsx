"use client";

import { cn } from "@/lib/utils";
import type { MessageRecord } from "@/lib/types";

interface MessageCardProps {
  message: MessageRecord;
  selected?: boolean;
  onClick?: (id: string) => void;
}

const severityDot: Record<string, string> = {
  clean: "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60",
  pending: "bg-text-secondary/30",
  warn: "bg-accent-amber shadow-[0_0_6px] shadow-accent-amber/60",
  flagged: "bg-accent-purple shadow-[0_0_6px] shadow-accent-purple/60",
  error: "bg-destructive/60",
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function MessageCard({ message, selected, onClick }: MessageCardProps) {
  const status = message.ai_status || "pending";

  return (
    <button
      type="button"
      onClick={() => onClick?.(message.id)}
      className={cn(
        "w-full text-left px-4 py-3 rounded-[var(--radius-panel)] transition-all duration-150 border",
        selected
          ? "glass-elevated border-border-glow"
          : "glass border-glass-border hover:border-border-glow/50 hover:scale-[1.002]",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <span className={cn("mt-1.5 size-2 rounded-full shrink-0", severityDot[status] || severityDot.pending)} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary truncate">{message.username}</span>
            <span className="text-[10px] font-mono text-text-secondary/50">{message.channel_id?.slice(0, 8)}</span>
            <span className="ml-auto text-[10px] text-text-secondary/40 shrink-0">
              {message.created_at ? formatRelativeTime(message.created_at) : ""}
            </span>
          </div>

          {/* Content */}
          <p className="text-sm text-text-secondary/80 line-clamp-2 leading-relaxed">
            {message.content || "(no text content)"}
          </p>

          {/* AI status badge */}
          {status !== "pending" && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono",
                status === "clean" && "bg-emerald-500/10 text-emerald-500",
                status === "warn" && "bg-accent-amber/10 text-accent-amber",
                status === "flagged" && "bg-accent-purple/10 text-accent-purple",
                status === "error" && "bg-destructive/10 text-destructive",
              )}>
                {status}
              </span>
              {message.ai_moderation_flags && message.ai_moderation_flags.length > 0 && (
                <span className="text-[10px] text-text-secondary/50 font-mono">
                  {message.ai_moderation_flags}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

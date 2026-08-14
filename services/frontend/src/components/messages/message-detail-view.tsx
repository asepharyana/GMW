"use client";

import { useState } from "react";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import {
  getMessageChannelLabel,
  renderMessageContent,
  safeParseJsonArray,
} from "@/lib/format";
import type { AttachmentRef, MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiStatusBadge, SeverityTick } from "./ai-status-badge";
import { AttachmentsGrid } from "./attachments-grid";
import { Lightbox } from "./lightbox";

function extractAttachments(metadata?: string | null): AttachmentRef[] {
  if (!metadata) return [];
  try {
    const m = JSON.parse(metadata);
    return (m?.attachments ?? []) as AttachmentRef[];
  } catch {
    return [];
  }
}

function fmtFull(ts?: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export interface MessageDetailProps {
  message: MessageRecord;
  channelLabel?: string;
}

export function MessageDetailView({
  message: msg,
  channelLabel,
}: MessageDetailProps) {
  const [img, setImg] = useState<string | null>(null);
  const severity = msg.ai_severity ?? "none";
  const flags = safeParseJsonArray(msg.ai_moderation_flags || "[]");

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <Avatar src={msg.avatar_url} name={msg.username} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold">{msg.username}</span>
            <span className="mono text-xs text-[var(--color-ink-soft)]">
              {fmtFull(msg.created_at)}
            </span>
            <AiStatusBadge status={msg.ai_status ?? null} />
          </div>
          <div className="mt-2 text-xs text-[var(--color-ink-soft)]">
            #{channelLabel ?? getMessageChannelLabel(msg)}
            {msg.thread_id && <span className="mx-1 opacity-40">·</span>}
            {msg.thread_id && <span>Thread {msg.thread_id.slice(0, 8)}</span>}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "relative rounded-[var(--radius-r)] p-4",
          severity === "critical"
            ? "border-l-2 border-[var(--color-vermilion)]"
            : severity === "high"
              ? "border-l-2 border-[var(--color-amber)]"
              : "border border-[var(--color-hairline)]",
        )}
      >
        <SeverityTick severity={severity} />
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

      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={f} tone="vermilion">
              {f}
            </Badge>
          ))}
        </div>
      )}

      {msg.ai_analysis && (
        <div className="mt-3 rounded-[var(--radius-r)] bg-[var(--color-surface-2)] p-3 text-xs">
          <span className="font-medium text-[var(--color-amber)]">
            AI analysis:
          </span>{" "}
          <span className="text-[var(--color-ink-soft)]">
            {msg.ai_analysis}
          </span>
        </div>
      )}

      {extractAttachments(msg.metadata).length > 0 && (
        <AttachmentsGrid
          attachments={extractAttachments(msg.metadata)}
          onOpen={(u) => setImg(u)}
        />
      )}
      <Lightbox
        open={!!img}
        onClose={() => setImg(null)}
        src={img ?? undefined}
      />
    </>
  );
}

"use client";

import { ArrowLeft, MessageSquare, MessagesSquare, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getMessageChannelLabel, renderMessageContent } from "@/lib/format";
import type { AttachmentRecord, MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiAnalysisPanel } from "./ai-analysis-panel";
import { AttachmentsGrid } from "./attachments-grid";

interface MessageDetailViewProps {
  message: MessageRecord;
  attachments?: AttachmentRecord[];
  onBack?: () => void;
  onImageClick?: (index: number) => void;
}

export function MessageDetailView({
  message,
  attachments,
  onBack,
  onImageClick,
}: MessageDetailViewProps) {
  return (
    <Card
      className={cn("h-full", "[--card-spacing:0px]", "rounded-2xl", "p-5")}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-text-secondary/60 hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="size-3" /> Back
        </button>
      )}

      {/* Message header */}
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="size-4 text-primary" />
        <span className="font-semibold text-sm text-text-primary">
          {message.username}
        </span>
        <span className="text-[10px] text-text-secondary/40 font-mono inline-flex items-center gap-1">
          {message.thread_id && <MessagesSquare className="size-3" />}
          {getMessageChannelLabel(message)}
        </span>
      </div>

      {/* Content */}
      <div className="text-sm text-text-primary/90 leading-relaxed mb-4 whitespace-pre-wrap">
        {renderMessageContent(
          message.edited_content ?? message.content,
          message.metadata,
        ) || "(no text content)"}
      </div>

      {/* Edit history */}
      {message.edit_history && message.edit_history.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-border/40 bg-card/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary/50 flex items-center gap-1">
            <Pencil className="size-3" />
            Riwayat edit · {message.edit_history.length} versi sebelumnya
          </p>
          {message.edit_history.map((edit, i) => (
            <div key={`${edit.edited_at}-${i}`} className="space-y-0.5">
              <p className="text-[10px] font-mono text-text-secondary/40">
                {new Date(edit.edited_at).toLocaleString("id-ID")}
              </p>
              <p className="text-xs leading-relaxed text-text-secondary/80 line-clamp-4 whitespace-pre-wrap">
                {renderMessageContent(edit.old_content, message.metadata) ||
                  "(kosong)"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mb-4">
          <AttachmentsGrid
            attachments={attachments}
            onImageClick={onImageClick}
          />
        </div>
      )}

      {/* AI Analysis */}
      <AiAnalysisPanel
        status={message.ai_status}
        severity={message.ai_severity}
        confidence={message.ai_confidence}
        flags={message.ai_moderation_flags}
        categories={message.ai_categories}
        action={message.ai_recommended_action}
        score={message.ai_moderation_score}
        analysis={message.ai_analysis}
      />
    </Card>
  );
}

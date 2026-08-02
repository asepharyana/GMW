"use client";

import { ArrowLeft, MessageSquare, MessagesSquare } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { getMessageChannelLabel, renderMessageContent } from "@/lib/format";
import type { AttachmentRecord, MessageRecord } from "@/lib/types";
import { AiAnalysisPanel } from "./ai-analysis-panel";
import { AttachmentsGrid } from "./attachments-grid";

interface MessageDetailViewProps {
  message: MessageRecord;
  attachments?: AttachmentRecord[];
  onBack?: () => void;
}

export function MessageDetailView({
  message,
  attachments,
  onBack,
}: MessageDetailViewProps) {
  return (
    <GlassCard variant="base" className="h-full">
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

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mb-4">
          <AttachmentsGrid attachments={attachments} />
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
    </GlassCard>
  );
}

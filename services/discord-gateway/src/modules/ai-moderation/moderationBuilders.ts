/**
 * moderationBuilders.ts
 *
 * Shared builder utilities extracted from llmModerationClient.ts.
 * Used by both mediaAnalysisClient.ts and moderationOrchestrator.ts.
 */

import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { sanitizeDiscordTokens } from "./discordTokens.js";

/** Simple XML-escaping for content text. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns the real text content for AI analysis, stripping fallback text
 * that getDisplayContent() synthesized ("[Attachment: ...]", "[Sticker: ...]",
 * "[Embed]"). These filenames alone are meaningless to the LLM and can
 * falsely inflate a "clean" verdict when the actual image failed to download.
 */
export function getAnalysisContent(message: MessageRecord): string {
  const raw = message.edited_content ?? message.content;
  const stripped = raw.replace(
    /\[(?:Attachment|Sticker):[^\]]*\]|\[Embed\]/g,
    "",
  );
  return sanitizeDiscordTokens(stripped).trim();
}

/**
 * Builds a <reference> XML element for reply/forward/crosspost context.
 */
export async function buildReferenceXml(msg: MessageRecord): Promise<string> {
  const parts: string[] = [];
  if (msg.is_reply && msg.reference_message_id) {
    parts.push(`type="reply"`);
  } else if (msg.is_forward && msg.reference_message_id) {
    parts.push(`type="forward"`);
  }
  if (msg.is_crosspost) {
    parts.push(`type="crosspost"`);
  }
  if (!msg.reference_message_id) return "";

  let parentContent = "";
  if (msg.reference_message_id) {
    // 1. Try DB first — works for messages captured in the same server
    try {
      const parent = await messageStore.getMessageById(
        msg.reference_message_id,
      );
      if (parent) {
        const parentText = parent.edited_content ?? parent.content;
        parentContent = parentText.slice(0, 500);
      }
    } catch {
      // Parent fetch failed — fall through to metadata
    }

    // 2. Fall back to metadata — works for forwards from other servers/channels
    //    where the original message was never captured in this DB.
    //    The capture phase stores the snapshot content in metadata.reference.content.
    if (!parentContent && msg.metadata) {
      try {
        const meta = JSON.parse(msg.metadata);
        const refContent = meta?.reference?.content;
        if (refContent && typeof refContent === "string") {
          parentContent = refContent.slice(0, 500);
        }
      } catch {
        // Metadata parse failed — no fallback available
      }
    }
  }

  const attr = parts.join(" ");
  const parentXml = parentContent
    ? `<parent_content>${escapeXml(parentContent)}</parent_content>`
    : "";
  return `<reference ${attr} message_id="${msg.reference_message_id}" channel_id="${msg.reference_channel_id ?? ""}" guild_id="${msg.reference_guild_id ?? ""}">${parentXml}</reference>`;
}

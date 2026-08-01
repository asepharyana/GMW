import { createChildLogger } from "@/shared/logger/index";
import { encoding_for_model as encodingForModel } from "tiktoken";
import {
  formatMediaEvidenceForPrompt,
  renderDiscordMentions,
} from "../message-capture/messageMetadata.js";
import type { MessageRecord } from "../message-capture/types.js";
import { sanitizeDiscordTokens } from "./discordTokens.js";

const logger = createChildLogger("conversationContext");

export interface ConversationContextInput {
  contextBefore: MessageRecord[];
  targets: MessageRecord[];
  maxTokens: number;
}

let _encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder(): ReturnType<typeof encodingForModel> {
  if (!_encoder) {
    _encoder = encodingForModel("gpt-4o");
  }
  return _encoder;
}

/**
 * Formats a timestamp to ISO 8601 string
 */
function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Estimates token count for a string using tiktoken for accurate counting
 */
export function estimateTokens(text: string): number {
  // Use tiktoken for accurate token counting (+15 overhead for JSON structure)
  const tokens = getEncoder().encode(text).length + 15;
  logger.debug(
    { tokenEstimate: tokens, textLength: text.length },
    "Estimated tokens for text",
  );
  return tokens;
}

/**
 * Formats reference info for a message (reply/forward/crosspost).
 *
 * The replied-to content is stored in the message metadata
 * (`metadata.reference.content` / `repliedUsername`) at capture time, so
 * include it here — the LLM can then explain WHAT the user is replying to
 * instead of only seeing a raw message ID it cannot resolve.
 */
function formatReferenceInfo(msg: MessageRecord): string {
  const parts: string[] = [];

  let repliedContent: string | null = null;
  let repliedUsername: string | null = null;
  try {
    const meta = JSON.parse(msg.metadata ?? "") as {
      reference?: {
        content?: string | null;
        repliedUsername?: string | null;
      } | null;
    };
    repliedContent = meta?.reference?.content ?? null;
    repliedUsername = meta?.reference?.repliedUsername ?? null;
  } catch {
    // metadata malformed — fall back to ID-only reference
  }

  const repliedText = (repliedContent ?? "").trim();
  const repliedSnippet = repliedText
    ? sanitizeDiscordTokens(
        repliedText.length > 200
          ? `${repliedText.slice(0, 200)}…`
          : repliedText,
      )
    : null;

  if (msg.is_reply && msg.reference_message_id) {
    const who = repliedUsername ? ` oleh ${repliedUsername}` : "";
    const what = repliedSnippet ? `: "${repliedSnippet}"` : "";
    parts.push(`[reply_to: ${msg.reference_message_id}${who}${what}]`);
    if (msg.reference_channel_id) {
      parts.push(`(reply_channel: ${msg.reference_channel_id})`);
    }
  }
  if (msg.is_forward && msg.reference_message_id) {
    parts.push(`[forward_from: ${msg.reference_message_id}]`);
  }
  if (msg.is_crosspost) {
    parts.push(`[crosspost]`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Formats a single message for context or target display
 */
export function formatMessageForPrompt(
  msg: MessageRecord,
  label: "context" | "target",
): string {
  const content = sanitizeDiscordTokens(
    renderDiscordMentions(msg.edited_content ?? msg.content, msg.metadata),
  );
  const timestamp = formatTimestamp(msg.created_at);
  const mediaEvidence = formatMediaEvidenceForPrompt(msg.metadata);
  const mediaSuffix = mediaEvidence ? ` ${mediaEvidence}` : "";
  const refInfo = formatReferenceInfo(msg);
  return `[${label}] id=${msg.id} time=${timestamp} user=${msg.username}: ${content}${mediaSuffix}${refInfo}`;
}

/**
 * Builds conversation historical context without including targets.
 * Calculates how much token budget targets use, and fills the rest with context.
 */
export function buildConversationContext(
  input: ConversationContextInput,
): string[] {
  const { contextBefore, targets, maxTokens } = input;

  // Calculate tokens used by targets (parallel)
  const targetLines = targets.map((msg) =>
    formatMessageForPrompt(msg, "target"),
  );
  let usedTokens = targetLines.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  const contextLines = contextBefore.map((msg) =>
    formatMessageForPrompt(msg, "context"),
  );
  const selectedContextLines: string[] = [];

  // Go backwards through context, taking most recent first
  for (let i = contextLines.length - 1; i >= 0; i--) {
    const line = contextLines[i];
    const lineTokens = estimateTokens(line);

    if (usedTokens + lineTokens <= maxTokens) {
      // Unshift so oldest context is first in the array
      selectedContextLines.unshift(line);
      usedTokens += lineTokens;
    }
  }

  logger.debug(
    {
      targetCount: targets.length,
      contextCount: selectedContextLines.length,
      usedTokens,
      maxTokens,
    },
    "Conversation context built",
  );
  return selectedContextLines;
}

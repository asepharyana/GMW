import { encoding_for_model as encodingForModel } from "tiktoken";
import { createChildLogger } from "@/shared/logger/index";
import {
  formatMediaEvidenceForPrompt,
  renderDiscordMentions,
} from "../message-capture/messageMetadata.js";
import type { MessageRecord } from "../message-capture/types.js";
import { sanitizeDiscordTokens } from "./discordTokens.js";
import { resolveDisplayName } from "./moderationBuilders.js";

const logger = createChildLogger("conversationContext");

export interface ConversationContextInput {
  contextBefore: MessageRecord[];
  targets: MessageRecord[];
  maxTokens: number;
  /**
   * Hard age cap for context messages (ms). Messages older than this
   * relative to the target are stale conversation noise and dropped.
   */
  maxAgeMs?: number;
  /**
   * Silence threshold (ms). A gap between consecutive context messages
   * larger than this means the conversation restarted — older messages
   * belong to a previous conversation and are dropped.
   */
  gapMs?: number;
}

export interface ConversationContextResult {
  /** Formatted context lines (oldest → newest, recency-gated). */
  lines: string[];
  /** One-line flow descriptor: status, span, dropped counts. */
  descriptor: string;
  /** Number of context messages dropped by the recency gates. */
  dropped: number;
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
  return `[${label}] id=${msg.id} time=${timestamp} user=${resolveDisplayName(msg)}: ${content}${mediaSuffix}${refInfo}`;
}

/**
 * Builds a one-line `<location_context>` source line for the batch — channel
 * name, thread name and age-restriction flags from captured message metadata.
 * The LLM uses it to judge messages in the right channel context (e.g. a
 * thread about a specific topic, or an age-restricted channel).
 */
export function buildLocationContext(targets: MessageRecord[]): string {
  const target = targets[0];
  if (!target?.metadata) return "";
  try {
    const meta = JSON.parse(target.metadata) as {
      channel?: {
        channelName?: string | null;
        threadName?: string | null;
        nsfw?: boolean;
        ageRestricted?: boolean;
        nsfwLevel?: string | null;
      } | null;
    };
    const ch = meta?.channel;
    if (!ch) return "";
    const parts: string[] = [];
    parts.push(
      `id=${target.channel_id}${
        ch.channelName ? ` name=${JSON.stringify(ch.channelName)}` : ""
      }`,
    );
    if (target.thread_id || ch.threadName) {
      parts.push(
        `thread=${target.thread_id}${
          ch.threadName ? ` thread_name=${JSON.stringify(ch.threadName)}` : ""
        }`,
      );
    }
    if (typeof ch.nsfw === "boolean") {
      parts.push(`nsfw=${ch.nsfw}`);
    }
    if (typeof ch.ageRestricted === "boolean") {
      parts.push(`age_restricted=${ch.ageRestricted}`);
    }
    return `[location] ${parts.join(" ")}`;
  } catch {
    return "";
  }
}

/**
 * Builds conversation historical context without including targets.
 *
 * Two recency gates decide whether a conversation is STILL the same one
 * ("obrolan berlanjut") or already restarted:
 *  - `gapMs`: a silence longer than this between two context messages cuts
 *    the block there — earlier messages belong to a previous conversation.
 *  - `maxAgeMs`: anything older than this relative to the target is noise.
 *
 * On a cold start (no recent context), the nearest messages are kept as a
 * sparse anchor and the descriptor says `cold_start` instead of `ongoing`,
 * so the LLM does not mistake scattered old messages for an active chat.
 */
export function buildConversationContext(
  input: ConversationContextInput,
): ConversationContextResult {
  const { contextBefore, targets, maxTokens } = input;
  const maxAgeMs = input.maxAgeMs ?? 45 * 60 * 1000;
  const gapMs = input.gapMs ?? 12 * 60 * 1000;

  const targetTime = targets.reduce(
    (min, t) => Math.min(min, t.created_at),
    targets[0]?.created_at ?? Date.now(),
  );

  // ── Recency gating (walk newest → oldest) ───────────────────────────────
  const gated: MessageRecord[] = [];
  let latestSelected: MessageRecord | null = null;
  let gapBeforeMs: number | null = null;
  let dropped = 0;

  for (let i = contextBefore.length - 1; i >= 0; i--) {
    const msg = contextBefore[i];
    // Age gate
    if (targetTime - msg.created_at > maxAgeMs) {
      dropped += i + 1; // everything older also exceeds the age cap
      break;
    }
    // Gap gate — silence between this message and the newer one already selected
    if (latestSelected && latestSelected.created_at - msg.created_at > gapMs) {
      gapBeforeMs = latestSelected.created_at - msg.created_at;
      dropped += i + 1;
      break;
    }
    gated.push(msg);
    latestSelected = msg;
  }

  const gatedNewestFirst = gated.reverse();
  let status: "ongoing" | "cold_start" | "sparse";
  if (gatedNewestFirst.length === 0) {
    // Cold start — keep a small anchor of the nearest messages so the LLM
    // still senses the channel, but mark it clearly.
    status = "cold_start";
    gatedNewestFirst.push(...contextBefore.slice(-2)); // ± 2 nearest to target
  } else if (gapBeforeMs === null) {
    status = "ongoing";
  } else {
    status = "sparse";
  }

  // ── Format + token budget (most recent first, like before) ─────────────
  const targetLines = targets.map((msg) =>
    formatMessageForPrompt(msg, "target"),
  );
  let usedTokens = targetLines.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  const contextLines = gatedNewestFirst.map((msg) =>
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

  const descriptorParts = [
    `[conversation_flow] status=${status}`,
    `context_msgs=${selectedContextLines.length}`,
    `dropped=${dropped}`,
  ];
  if (gapBeforeMs !== null) {
    descriptorParts.push(`gap_before_min=${Math.round(gapBeforeMs / 60000)}`);
  }
  const descriptor = descriptorParts.join(" ");

  logger.debug(
    {
      targetCount: targets.length,
      contextCount: selectedContextLines.length,
      status,
      dropped,
      usedTokens,
      maxTokens,
    },
    "Conversation context built",
  );
  return { lines: selectedContextLines, descriptor, dropped };
}

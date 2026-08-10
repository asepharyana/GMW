/**
 * moderationBuilders.ts
 *
 * Shared builder utilities extracted from llmModerationClient.ts.
 * Used by both mediaAnalysisClient.ts and moderationOrchestrator.ts.
 */

import { renderDiscordMentions } from "../message-capture/messageMetadata.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import { sanitizeDiscordTokens } from "./discordTokens.js";
import { sanitizeAiContent } from "./prompts/output.js";

/** Simple XML-escaping for content text. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Conversation context block — structured data for the USER message.
//
// All per-batch context lives in the USER message (not the SYSTEM prompt) so
// the system prompt is stable per mode (cacheable on routers/providers) and
// the role boundary is clean: instructions in SYSTEM, data in USER.
// ---------------------------------------------------------------------------

/** Outer char cap for the assembled `<conversation_context>` inner text. */
export const CONVERSATION_CONTEXT_MAX_CHARS = 40_000;

/**
 * Wraps per-batch context data into structured XML blocks for the USER
 * message:
 *
 *   <location_context channel_id="..." channel_name="..." nsfw="..."/>
 *   <conversation_context>
 *     [conversation_flow] status=ongoing context_msgs=12 dropped=0
 *     [context] id=... time=... user=...: isi pesan
 *     ...
 *   </conversation_context>
 *
 * Empty blocks are omitted entirely (never emit a hollow `<conversation_context>`
 * with no content). The inner text is AI/user-derived and passed through
 * `sanitizeAiContent` (CDATA + XML-escape) to block prompt injection.
 */
export function buildConversationContextBlock(input: {
  /** Pre-built `<location_context .../>` string (or ""). */
  location?: string;
  /** `[conversation_flow]` descriptor line from buildConversationContext. */
  descriptor?: string;
  /** `[context]` lines, oldest → newest. */
  lines: string[];
}): string {
  const blocks: string[] = [];
  const location = input.location?.trim();
  if (location) blocks.push(location);

  const inner = [input.descriptor ?? "", ...input.lines]
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  if (inner) {
    blocks.push(
      `<conversation_context>\n${sanitizeAiContent(inner, CONVERSATION_CONTEXT_MAX_CHARS)}\n</conversation_context>`,
    );
  }
  return blocks.join("\n");
}

// ---------------------------------------------------------------------------
// Per-message content bounds — protects the LLM token budget from a single
// huge paste (stack traces, log dumps, copypasta). Truncation is explicit so
// the model never mistakes the cut for a real message boundary.
// ---------------------------------------------------------------------------

/** Max characters of a message's content sent to the LLM `<content>` payload. */
export const AI_CONTENT_MAX_CHARS = 4000;

/** Marker appended when a message is longer than AI_CONTENT_MAX_CHARS. */
export const AI_CONTENT_TRUNC_MARKER = "\n…[pesan dipotong: terlalu panjang]";

/** Truncate a message's content for the LLM `<content>` payload. */
export function truncateForAi(content: string): string {
  if (content.length <= AI_CONTENT_MAX_CHARS) return content;
  return `${content.slice(0, AI_CONTENT_MAX_CHARS)}${AI_CONTENT_TRUNC_MARKER}`;
}

// ---------------------------------------------------------------------------
// User profile deduplication — a batch can contain many messages from the
// same user. Instead of repeating the (up to 3000-char) profile summary on
// every message, emit a single <user_profiles> map per batch and reference
// entries per message with <user_profile_ref user_id="..."/>.
// ---------------------------------------------------------------------------

/** Build a deduplicated `<user_profiles>` map block, keyed by Discord user id. */
export function buildUserProfilesBlock(
  profiles: ReadonlyMap<string, string>,
): string {
  const entries = Array.from(profiles.entries()).filter(
    ([, text]) => text.trim().length > 0,
  );
  if (entries.length === 0) return "";
  const lines = entries.map(
    ([userId, text]) =>
      `  <user_profile user_id="${escapeXml(userId)}">${sanitizeAiContent(text)}</user_profile>`,
  );
  return `<user_profiles>\n${lines.join("\n")}\n</user_profiles>`;
}

/** Per-message reference tag pointing at an entry in the `<user_profiles>` map. */
export function buildUserProfileRef(userId: string): string {
  return `<user_profile_ref user_id="${escapeXml(userId)}"/>`;
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
  return sanitizeDiscordTokens(
    renderDiscordMentions(stripped, message.metadata),
  ).trim();
}

/**
 * Server nickname (member.displayName) when captured, else the author
 * username. Discord shows the server nickname to other members, so the LLM
 * should see the same name the channel sees — and a nickname can carry
 * moderation signal itself (offensive nick + clean message → low warn).
 */
export function resolveDisplayName(msg: MessageRecord): string {
  if (msg.metadata) {
    try {
      const meta = JSON.parse(msg.metadata) as {
        member?: { displayName?: string | null } | null;
      };
      const dn = meta?.member?.displayName;
      if (dn && dn.trim().length > 0) return dn;
    } catch {
      // malformed metadata — fall back to username
    }
  }
  return msg.username;
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

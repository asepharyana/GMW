import type { MessageMetadata } from "@/lib/types/message";

/**
 * Format a number with locale separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely parse a JSON string into an array.
 */
export function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * Safely parse a JSON string into an object.
 */
export function safeParseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

/**
 * Resolve a human-readable channel/thread label for a message.
 *
 * The channel name (and thread name, when the message lives in a thread)
 * is captured by the gateway into the message metadata JSON under
 * `metadata.channel.{channelName,threadName}`. Prefer names over raw IDs:
 * a thread message shows its thread name, otherwise the channel name,
 * falling back to a truncated channel ID only when names are unavailable.
 */
export function getMessageChannelLabel(msg: {
  channel_id?: string;
  metadata?: string | null;
}): string {
  let channelName: string | undefined;
  let threadName: string | undefined;
  try {
    const m = JSON.parse(msg.metadata ?? "");
    const ch = m?.channel;
    channelName =
      typeof ch?.channelName === "string" ? ch.channelName : undefined;
    threadName = typeof ch?.threadName === "string" ? ch.threadName : undefined;
  } catch {
    // metadata malformed — fall through to ID fallback
  }
  if (threadName) return threadName;
  if (channelName) return channelName;
  return msg.channel_id?.slice(0, 8) ?? "";
}

/**
 * Render Discord mention/emoji/sticker tokens in message content to readable
 * names using the captured metadata (mentionedRoles / mentionedUsers /
 * customEmojis / stickers). Mirror of the gateway's renderDiscordMentions.
 *
 * - `<@&id>`           → `@RoleName` (falls back to `@role`)
 * - `<@id>` / `<@!id>` → `@Username` (falls back to `@user`)
 * - `<:name:id>`       → `:name:`    (falls back to the literal name)
 * - sticker-only content already stored as `[Sticker: name]`; when a message
 *   has both text and stickers, append `[Sticker: name]` so stickers always
 *   surface in the feed.
 */
export function renderMessageContent(
  content: string,
  metadata?: string | null,
): string {
  if (!content) return content;
  let m: MessageMetadata | null = null;
  try {
    m = JSON.parse(metadata ?? "") as MessageMetadata;
  } catch {
    // metadata malformed — render tokens from their literal names only
  }

  let rendered = content;
  if (rendered.includes("<")) {
    const roles = new Map(
      (m?.mentionedRoles ?? []).map((r) => [r.id, r.name] as const),
    );
    const users = new Map(
      (m?.mentionedUsers ?? []).map((u) => [u.id, u.username] as const),
    );
    const emojis = new Map(
      (m?.customEmojis ?? []).map((e) => [e.id, e.name] as const),
    );
    rendered = rendered.replace(
      /<(?:a)?:([a-zA-Z0-9_]+):(\d{17,20})>|<@!?(\d{17,20})>|<@&(\d{17,20})>/g,
      (_full, emojiTokenName, emojiId, userId, roleId) => {
        if (emojiId !== undefined) {
          return `:${emojis.get(emojiId) ?? emojiTokenName}:`;
        }
        if (roleId !== undefined) return `@${roles.get(roleId) ?? "role"}`;
        if (userId !== undefined) return `@${users.get(userId) ?? "user"}`;
        return _full;
      },
    );
  }

  const stickers = m?.stickers ?? [];
  if (
    stickers.length > 0 &&
    !rendered.includes("[Sticker:") &&
    !rendered.includes("[Attachment:")
  ) {
    rendered += ` ${stickers
      .map((s) => `[Sticker: ${s.name ?? "unknown"}]`)
      .join(" ")}`;
  }

  return rendered;
}

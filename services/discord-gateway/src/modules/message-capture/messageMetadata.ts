import type {
  Message,
  TextChannel,
  ThreadChannel,
} from "discord.js-selfbot-v13";

export interface MessageLocation {
  channelId: string;
  threadId: string | null;
  threadName: string | null;
  channelName: string | null;
  /** Channel topic (resmi/deskripsi channel) — strong context for judging
   *  whether a message fits the channel's purpose. Guarded: some channel
   *  types (threads on older API builds) expose no topic. */
  topic?: string | null;
  nsfw?: boolean;
  nsfwLevel?: string | null;
  ageRestricted?: boolean;
}

export interface StickerEvidence {
  id: string;
  name: string;
  url: string;
  format: string | null;
}

export interface CustomEmojiEvidence {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export interface MentionedRoleEvidence {
  id: string;
  name: string;
}

export interface MentionedUserEvidence {
  id: string;
  username: string;
}

export interface EmbedEvidence {
  title: string | null;
  description: string | null;
  url: string | null;
  color: number | null;
  image: string | null;
  thumbnail: string | null;
  author: {
    name: string | null;
    url: string | null;
    iconURL: string | null;
  } | null;
  footer: { text: string | null; iconURL: string | null } | null;
  fields: Array<{ name: string; value: string; inline: boolean }>;
}

export interface AttachmentEvidence {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  size: number;
}

export interface MessageMediaEvidence {
  stickers: StickerEvidence[];
  embeds: EmbedEvidence[];
  attachments: AttachmentEvidence[];
  customEmojis: CustomEmojiEvidence[];
}

export interface RichMessageMetadata {
  stickers: Array<StickerEvidence>;
  embeds: Array<EmbedEvidence>;
  attachments: Array<AttachmentEvidence>;
  customEmojis: Array<CustomEmojiEvidence>;
  mentionedRoles: Array<MentionedRoleEvidence>;
  mentionedUsers: Array<MentionedUserEvidence>;
  author: {
    id: string;
    username: string;
    tag: string | null;
    avatarURL: string | null;
    bot: boolean;
  };
  member: {
    displayName: string | null;
    roles: Array<{ id: string; name: string }>;
    joinedTimestamp: number | null;
  } | null;
  channel: MessageLocation;
  reference: {
    messageId: string | null;
    channelId: string | null;
    guildId: string | null;
    type: string | null;
    content: string | null;
    repliedUsername: string | null;
    repliedUserId: string | null;
  } | null;
  isCrosspost: boolean;
}

export function getMessageLocation(message: Message): MessageLocation {
  const channel = message.channel as TextChannel | ThreadChannel;
  const safetyChannel = channel as TextChannel & {
    nsfw?: boolean;
    nsfwLevel?: string | null;
  };
  const topic =
    "topic" in channel && typeof channel.topic === "string"
      ? channel.topic
      : null;
  if (!channel.isThread?.()) {
    return {
      channelId: message.channelId,
      threadId: null,
      threadName: null,
      channelName: "name" in channel ? channel.name : null,
      topic,
      nsfw:
        typeof safetyChannel.nsfw === "boolean"
          ? safetyChannel.nsfw
          : undefined,
      nsfwLevel:
        typeof safetyChannel.nsfwLevel === "string"
          ? safetyChannel.nsfwLevel
          : null,
      ageRestricted:
        typeof safetyChannel.nsfw === "boolean"
          ? safetyChannel.nsfw
          : undefined,
    };
  }

  return {
    channelId: channel.parentId ?? message.channelId,
    threadId: channel.id,
    threadName: channel.name,
    channelName: channel.parent?.name ?? null,
    topic,
    nsfw:
      typeof safetyChannel.nsfw === "boolean" ? safetyChannel.nsfw : undefined,
    nsfwLevel:
      typeof safetyChannel.nsfwLevel === "string"
        ? safetyChannel.nsfwLevel
        : null,
    ageRestricted:
      typeof safetyChannel.nsfw === "boolean" ? safetyChannel.nsfw : undefined,
  };
}

export function getStickerMetadata(
  message: Message,
): RichMessageMetadata["stickers"] {
  return Array.from(message.stickers.values()).map((sticker) => ({
    id: sticker.id,
    name: sticker.name,
    url: sticker.url,
    format: sticker.format ?? null,
  }));
}

/**
 * Extract custom emoji references from message content.
 * Builds Discord CDN URLs for each emoji so they can be downloaded
 * and sent to the vision model for analysis.
 */
export function getCustomEmojiMetadata(
  message: Message,
): RichMessageMetadata["customEmojis"] {
  const CUSTOM_EMOJI_PATTERN = /<(a)?:([a-zA-Z0-9_]+):(\d+)>/g;
  const emojis: CustomEmojiEvidence[] = [];
  const matches = [...message.content.matchAll(CUSTOM_EMOJI_PATTERN)];
  for (const match of matches) {
    const [, animated, name, id] = match;
    const ext = animated ? "gif" : "png";
    emojis.push({
      id,
      name,
      animated: animated === "a",
      url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`,
    });
  }
  return emojis;
}

export function getAttachmentMetadata(
  message: Message,
): RichMessageMetadata["attachments"] {
  return Array.from(message.attachments.values()).map((attachment) => ({
    id: attachment.id,
    name: attachment.name || "unknown",
    url: attachment.url,
    contentType: attachment.contentType ?? null,
    size: attachment.size,
  }));
}

export function getEmbedMetadata(
  message: Message,
): RichMessageMetadata["embeds"] {
  return message.embeds.map((embed) => ({
    title: embed.title ?? null,
    description: embed.description ?? null,
    url: embed.url ?? null,
    color: embed.color ?? null,
    image: embed.image?.url ?? null,
    thumbnail: embed.thumbnail?.url ?? null,
    author: embed.author
      ? {
          name: embed.author.name ?? null,
          url: embed.author.url ?? null,
          iconURL: embed.author.iconURL ?? null,
        }
      : null,
    footer: embed.footer
      ? {
          text: embed.footer.text ?? null,
          iconURL: embed.footer.iconURL ?? null,
        }
      : null,
    fields: embed.fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    })),
  }));
}

/**
 * Try to get referenced message content from the channel cache or message snapshots.
 * For replies, Discord sends `referenced_message` in the API, which
 * discord.js-selfbot-v13 caches in the channel's message manager.
 * For forwards, Discord sends `message_snapshots` which discord.js-selfbot-v13
 * stores in `message.messageSnapshots` as a Collection of partial Message objects.
 * Returns null if the message can't be resolved from either source.
 */
function getReferencedMessageContent(
  message: Message,
): { content: string; username: string; userId: string } | null {
  const ref = message.reference;
  if (!ref?.messageId) return null;

  // 1. Channel cache — works for same-channel replies/forwards
  try {
    const cached = (message.channel as any)?.messages?.cache?.get(
      ref.messageId,
    );
    if (cached?.content) {
      return {
        content: cached.content,
        username: cached.author?.username ?? "Unknown",
        userId: cached.author?.id ?? "",
      };
    }
  } catch {
    // Cache may not be available or message not in it
  }

  // 2. messageSnapshots — works for cross-channel/cross-server forwards
  //    Discord API sends message_snapshots for FORWARD type messages,
  //    and discord.js-selfbot-v13 stores them in message.messageSnapshots.
  try {
    const snapshot = message.messageSnapshots?.get(ref.messageId);
    if (snapshot?.content) {
      return {
        content: snapshot.content,
        username: (snapshot as any).author?.username ?? "Unknown",
        userId: (snapshot as any).author?.id ?? "",
      };
    }
  } catch {
    // Snapshots may not be available
  }

  return null;
}

export function getMessageMetadata(message: Message): RichMessageMetadata {
  const member = message.member;
  const referenceContent = getReferencedMessageContent(message);
  const ref = message.reference;
  return {
    stickers: getStickerMetadata(message),
    embeds: getEmbedMetadata(message),
    attachments: getAttachmentMetadata(message),
    customEmojis: getCustomEmojiMetadata(message),
    mentionedRoles: Array.from(message.mentions?.roles?.values() ?? []).map(
      (role) => ({ id: role.id, name: role.name }),
    ),
    mentionedUsers: Array.from(message.mentions?.users?.values() ?? []).map(
      (user) => ({ id: user.id, username: user.username }),
    ),
    author: {
      id: message.author.id,
      username: message.author.username,
      tag: "tag" in message.author ? message.author.tag : null,
      avatarURL: message.author.avatarURL() ?? null,
      bot: Boolean(message.author.bot),
    },
    member: member
      ? {
          displayName: member.displayName ?? null,
          roles: member.roles.cache.map((role) => ({
            id: role.id,
            name: role.name,
          })),
          joinedTimestamp: member.joinedTimestamp ?? null,
        }
      : null,
    channel: getMessageLocation(message),
    reference: ref
      ? {
          messageId: ref.messageId ?? null,
          channelId: ref.channelId ?? null,
          guildId: ref.guildId ?? null,
          type: (ref.type as unknown as string | undefined) ?? null,
          content: referenceContent?.content ?? null,
          repliedUsername: referenceContent?.username ?? null,
          repliedUserId: referenceContent?.userId ?? null,
        }
      : null,
    isCrosspost: message.flags?.has(1 << 1) ?? false,
  };
}

export function parseRichMessageMetadata(
  metadata: string | null | undefined,
): RichMessageMetadata | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata) as Partial<RichMessageMetadata>;
    return {
      stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
      embeds: Array.isArray(parsed.embeds) ? parsed.embeds : [],
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      customEmojis: Array.isArray(parsed.customEmojis)
        ? parsed.customEmojis
        : [],
      mentionedRoles: Array.isArray(parsed.mentionedRoles)
        ? parsed.mentionedRoles
        : [],
      mentionedUsers: Array.isArray(parsed.mentionedUsers)
        ? parsed.mentionedUsers
        : [],
      author: parsed.author as RichMessageMetadata["author"],
      member: (parsed.member ?? null) as RichMessageMetadata["member"],
      channel: parsed.channel as RichMessageMetadata["channel"],
      reference: (parsed.reference ?? null) as RichMessageMetadata["reference"],
      isCrosspost: Boolean(parsed.isCrosspost),
    };
  } catch {
    return null;
  }
}

export function isAgeRestrictedMetadata(
  metadata: string | null | undefined,
): boolean {
  const parsed = parseRichMessageMetadata(metadata);
  if (!parsed) return false;

  const nsfwLevel = parsed.channel.nsfwLevel?.toUpperCase();
  return Boolean(
    parsed.channel.nsfw ||
      parsed.channel.ageRestricted ||
      nsfwLevel === "AGE_RESTRICTED",
  );
}

export function isAgeRestrictedMessage(message: Message): boolean {
  try {
    const channel = message.channel as {
      nsfw?: boolean;
      nsfwLevel?: string | number | null;
      isThread?: () => boolean;
      parent?: { nsfw?: boolean; nsfwLevel?: string | number | null } | null;
    };
    if (channel.nsfw) return true;
    if (
      typeof channel.nsfwLevel === "string" &&
      channel.nsfwLevel.toUpperCase() === "AGE_RESTRICTED"
    )
      return true;
    if (channel.isThread?.() && channel.parent) {
      if (channel.parent.nsfw) return true;
      if (
        typeof channel.parent.nsfwLevel === "string" &&
        channel.parent.nsfwLevel.toUpperCase() === "AGE_RESTRICTED"
      )
        return true;
    }
  } catch {
    // Can't determine → allow capture
  }
  return false;
}

export function extractMessageMediaEvidence(
  metadata: string | null | undefined,
): MessageMediaEvidence {
  const parsed = parseRichMessageMetadata(metadata);
  return {
    stickers: parsed?.stickers ?? [],
    embeds: parsed?.embeds ?? [],
    attachments: parsed?.attachments ?? [],
    customEmojis: parsed?.customEmojis ?? [],
  };
}

export function formatMediaEvidenceForPrompt(
  metadata: string | null | undefined,
): string {
  const evidence = extractMessageMediaEvidence(metadata);
  const parts: string[] = [];

  if (evidence.stickers.length > 0) {
    parts.push(
      `[stickers: ${evidence.stickers
        .map((sticker) =>
          [`name=${sticker.name}`, sticker.url ? `url=${sticker.url}` : null]
            .filter(Boolean)
            .join(", "),
        )
        .join(" | ")}]`,
    );
  }

  if (evidence.embeds.length > 0) {
    parts.push(
      `[embeds: ${evidence.embeds
        .map((embed) =>
          [
            embed.title ? `title=${embed.title}` : null,
            embed.description ? `description=${embed.description}` : null,
            embed.url ? `url=${embed.url}` : null,
            embed.image ? `image=${embed.image}` : null,
            embed.thumbnail ? `thumbnail=${embed.thumbnail}` : null,
            embed.fields.length > 0
              ? `fields=${embed.fields.map((field) => `${field.name}: ${field.value}`).join("; ")}`
              : null,
          ]
            .filter(Boolean)
            .join(", "),
        )
        .join(" | ")}]`,
    );
  }

  if (evidence.attachments.length > 0) {
    parts.push(
      `[attachments: ${evidence.attachments
        .map((attachment) =>
          [
            `name=${attachment.name}`,
            attachment.contentType ? `type=${attachment.contentType}` : null,
            `size=${attachment.size}`,
            attachment.url ? `url=${attachment.url}` : null,
          ]
            .filter(Boolean)
            .join(", "),
        )
        .join(" | ")}]`,
    );
  }

  return parts.join(" ");
}

export function getDisplayContent(message: Message): string {
  if (message.content.trim().length > 0) return message.content;

  const stickers = getStickerMetadata(message);
  if (stickers.length > 0) {
    return stickers.map((sticker) => `[Sticker: ${sticker.name}]`).join(" ");
  }

  const attachments = getAttachmentMetadata(message);
  if (attachments.length > 0) {
    return attachments
      .map((attachment) => `[Attachment: ${attachment.name}]`)
      .join(" ");
  }

  const embeds = getEmbedMetadata(message);
  if (embeds.length > 0) {
    return embeds
      .map((embed) => embed.title || embed.description || "[Embed]")
      .join(" ");
  }

  return "";
}

/**
 * Renders Discord mention/emoji tokens in message content to readable names
 * using the captured metadata (mentionedRoles / mentionedUsers / customEmojis).
 *
 * - `<@&id>`          → `@RoleName` (falls back to `@role`)
 * - `<@id>` / `<@!id>` → `@Username` (falls back to `@user`)
 * - `<:name:id>`      → `:name:`    (falls back to the literal name)
 *
 * Unresolvable tokens keep Discord's own name from the token, so no numeric
 * snowflake ever reaches the reader. Content without "<" is returned untouched.
 * Used by both the LLM prompt pipeline (conversationContext / moderationBuilders)
 * and mirrored in the frontend (lib/format.ts renderMessageContent).
 */
export function renderDiscordMentions(
  content: string,
  metadata: string | null | undefined,
): string {
  if (!content || !content.includes("<")) return content;
  const parsed = parseRichMessageMetadata(metadata);
  const roleName = new Map(
    (parsed?.mentionedRoles ?? []).map((r) => [r.id, r.name] as const),
  );
  const userName = new Map(
    (parsed?.mentionedUsers ?? []).map((u) => [u.id, u.username] as const),
  );
  const emojiName = new Map(
    (parsed?.customEmojis ?? []).map((e) => [e.id, e.name] as const),
  );
  return content.replace(
    /<(?:a)?:([a-zA-Z0-9_]+):(\d{17,20})>|<@!?(\d{17,20})>|<@&(\d{17,20})>/g,
    (_full, emojiTokenName, emojiId, userId, roleId) => {
      if (emojiId !== undefined) {
        return `:${emojiName.get(emojiId) ?? emojiTokenName}:`;
      }
      if (roleId !== undefined) return `@${roleName.get(roleId) ?? "role"}`;
      if (userId !== undefined) return `@${userName.get(userId) ?? "user"}`;
      return _full;
    },
  );
}

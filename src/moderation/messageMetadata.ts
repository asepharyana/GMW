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
  } | null;
}

export function getMessageLocation(message: Message): MessageLocation {
  const channel = message.channel as TextChannel | ThreadChannel;
  const safetyChannel = channel as TextChannel & {
    nsfw?: boolean;
    nsfwLevel?: string | null;
  };
  if (!channel.isThread?.()) {
    return {
      channelId: message.channelId,
      threadId: null,
      threadName: null,
      channelName: "name" in channel ? channel.name : null,
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
  let match;
  while ((match = CUSTOM_EMOJI_PATTERN.exec(message.content)) !== null) {
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

export function getMessageMetadata(message: Message): RichMessageMetadata {
  const member = message.member;
  return {
    stickers: getStickerMetadata(message),
    embeds: getEmbedMetadata(message),
    attachments: getAttachmentMetadata(message),
    customEmojis: getCustomEmojiMetadata(message),
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
    reference: message.reference
      ? {
          messageId: message.reference.messageId ?? null,
          channelId: message.reference.channelId ?? null,
          guildId: message.reference.guildId ?? null,
        }
      : null,
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
      customEmojis: Array.isArray(parsed.customEmojis) ? parsed.customEmojis : [],
      author: parsed.author as RichMessageMetadata["author"],
      member: (parsed.member ?? null) as RichMessageMetadata["member"],
      channel: parsed.channel as RichMessageMetadata["channel"],
      reference: (parsed.reference ?? null) as RichMessageMetadata["reference"],
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

import { createChildLogger } from "@bete/shared/logger";
import type { Client, MessageReaction, User } from "discord.js-selfbot-v13";
import { getDatabase } from "../../shared/database/drizzle.js";
import { reactionsTable } from "../../shared/database/schema.js";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";

const logger = createChildLogger("reaction-tracking");

// ─── Helpers ─────────────────────────────────────────────────────────────

function isMonitoredGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  const guildIds = (config as any).EFFECTIVE_MONITOR_GUILD_IDS as string[] | undefined;
  if (!guildIds || guildIds.length === 0) return config.MONITOR_GUILD_ID === guildId;
  return guildIds.includes(guildId);
}

function getEmojiIdentifier(reaction: MessageReaction): {
  emoji: string;
  emojiId: string | null;
  animated: boolean;
} {
  const emoji = reaction.emoji;
  if (emoji.id) {
    return {
      emoji: emoji.name ?? emoji.id,
      emojiId: emoji.id,
      animated: Boolean((emoji as any).animated),
    };
  }
  return {
    emoji: emoji.name ?? "unknown",
    emojiId: null,
    animated: false,
  };
}

// ─── Event Handlers ──────────────────────────────────────────────────────

async function handleReactionAdd(
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  const guildId = reaction.message.guildId;
  if (!isMonitoredGuild(guildId)) return;
  if (user.bot) return;

  const { emoji, emojiId, animated } = getEmojiIdentifier(reaction);
  const now = Date.now();
  const id = `${reaction.message.id}-${emojiId ?? emoji}-${user.id}`;

  try {
    const db = getDatabase();
    await (db as any).insert(reactionsTable).values({
      id,
      message_id: reaction.message.id,
      channel_id: reaction.message.channelId,
      guild_id: guildId,
      user_id: user.id,
      username: user.username,
      emoji,
      emoji_id: emojiId,
      animated,
      reaction_type: "add",
      created_at: now,
    }).onConflictDoNothing();

    logger.debug(
      { messageId: reaction.message.id, emoji, userId: user.id },
      "Reaction recorded",
    );
  } catch (error) {
    logger.error(
      { messageId: reaction.message.id, error: String(error) },
      "Failed to record reaction",
    );
  }
}

async function handleReactionRemove(
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  const guildId = reaction.message.guildId;
  if (!isMonitoredGuild(guildId)) return;
  if (user.bot) return;

  const { emoji, emojiId, animated } = getEmojiIdentifier(reaction);
  const now = Date.now();
  const id = `${reaction.message.id}-${emojiId ?? emoji}-${user.id}`;

  try {
    const db = getDatabase();
    await (db as any).insert(reactionsTable).values({
      id,
      message_id: reaction.message.id,
      channel_id: reaction.message.channelId,
      guild_id: guildId,
      user_id: user.id,
      username: user.username,
      emoji,
      emoji_id: emojiId,
      animated,
      reaction_type: "remove",
      created_at: now,
    }).onConflictDoNothing();

    logger.debug(
      { messageId: reaction.message.id, emoji, userId: user.id },
      "Reaction removal recorded",
    );
  } catch (error) {
    logger.error(
      { messageId: reaction.message.id, error: String(error) },
      "Failed to record reaction removal",
    );
  }
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerReactionCapture(
  client: Client,
  eventBroadcaster: EventBroadcaster,
): void {
  logger.info("Registering reaction capture");

  client.on("messageReactionAdd", async (reaction, user) => {
    await handleReactionAdd(reaction, user);

    const guildId = reaction.message.guildId;
    if (!isMonitoredGuild(guildId)) return;

    const { emoji, emojiId, animated } = getEmojiIdentifier(reaction);

    eventBroadcaster.reactionAdded({
      message_id: reaction.message.id,
      channel_id: reaction.message.channelId,
      guild_id: guildId,
      user_id: user.id,
      username: user.username,
      emoji,
      emoji_id: emojiId,
      animated,
      created_at: Date.now(),
    }).catch(() => {});
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    await handleReactionRemove(reaction, user);

    const guildId = reaction.message.guildId;
    if (!isMonitoredGuild(guildId)) return;

    const { emoji, emojiId, animated } = getEmojiIdentifier(reaction);

    eventBroadcaster.reactionRemoved({
      message_id: reaction.message.id,
      channel_id: reaction.message.channelId,
      guild_id: guildId,
      user_id: user.id,
      username: user.username,
      emoji,
      emoji_id: emojiId,
      animated,
      created_at: Date.now(),
    }).catch(() => {});
  });
}

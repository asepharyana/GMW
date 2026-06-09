import { createChildLogger } from "@bete/shared/logger";
import type { Guild } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { MessageRecord } from "../message-capture/types.js";

interface ChannelWithSend {
  send: (content: string | object, options?: unknown) => Promise<unknown>;
}

const logger = createChildLogger("auto-delete-logger");

/**
 * Post a log message about the auto-deletion to the configured moderation log channel.
 * If AUTO_DELETE_LOG_CHANNEL_ID is not set, this is a no-op.
 * Failures (channel not found, missing permissions) are logged as warnings.
 */
export async function logDeletionToChannel(
  guild: Guild,
  message: MessageRecord,
  channelId: string,
): Promise<void> {
  if (!config.AUTO_DELETE_LOG_CHANNEL_ID) return;

  try {
    const logChannel = guild.channels.cache.get(
      config.AUTO_DELETE_LOG_CHANNEL_ID,
    );
    if (
      logChannel &&
      "send" in logChannel &&
      typeof (logChannel as ChannelWithSend).send === "function"
    ) {
      const severity = message.ai_severity ?? "none";
      const categories =
        message.ai_categories ?? message.ai_moderation_flags ?? "—";
      const snippet = (message.edited_content ?? message.content).substring(
        0,
        200,
      );
      await (logChannel as ChannelWithSend).send(
        `**🧹 Auto-Delete** — Pesan dari <@${message.user_id}> di <#${channelId}>\n` +
          `**Status:** ${message.ai_status}\n` +
          `**Severitas:** ${severity}\n` +
          `**Kategori:** ${categories}\n` +
          `**Isi:** ${snippet}\n` +
          `**Waktu:** <t:${Math.floor(Date.now() / 1000)}:R>`,
      );
      logger.info(
        { channelId, messageId: message.id },
        "Deletion logged to channel",
      );
    }
  } catch (logErr) {
    logger.warn(
      { messageId: message.id, error: String(logErr) },
      "Failed to log auto-delete to moderation channel",
    );
  }
}

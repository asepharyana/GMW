import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { MessageRecord } from "../message-capture/types.js";

const logger = createChildLogger("auto-delete-notify");

/**
 * Send a DM notification to the user whose message was auto-deleted.
 * If AUTO_DELETE_NOTIFY_USER is disabled, this is a no-op.
 * DM failures (user has DMs disabled, etc.) are logged at debug level and swallowed.
 */
export async function sendDeletionNotification(
  client: Client,
  message: MessageRecord,
  guildName: string,
): Promise<void> {
  if (!config.AUTO_DELETE_NOTIFY_USER) return;

  try {
    const targetUser = await client.users.fetch(message.user_id);
    if (targetUser) {
      const reason: string =
        message.ai_categories ?? message.ai_moderation_flags ?? "(unknown)";
      await targetUser.send(
        `Pesan Anda di **${guildName}** telah dihapus oleh sistem moderasi otomatis.\n` +
          `Alasan: ${reason}\n` +
          `Jika Anda merasa ini adalah kesalahan, silakan hubungi admin server.`,
      );
      logger.info(
        { userId: message.user_id, messageId: message.id },
        "Deletion notification sent",
      );
    }
  } catch (dmErr) {
    // DM might fail if user has DMs disabled — not critical
    logger.debug(
      {
        messageId: message.id,
        userId: message.user_id,
        error: String(dmErr),
      },
      "Failed to send DM notification for auto-deleted message",
    );
  }
}

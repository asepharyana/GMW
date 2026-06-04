import type { Client, PermissionString } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import { createChildLogger } from "@bete/shared/logger";
import { createModerationAction } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";

const logger = createChildLogger("auto-delete-manager");

const parseStringList = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
};

/** Derive severity from legacy messages that lack structured AI fields. */
function deriveSeverity(msg: MessageRecord): string {
  if (msg.ai_severity) return msg.ai_severity;
  const score = msg.ai_confidence ?? msg.ai_moderation_score ?? 0;
  if (msg.ai_status === "flagged")
    return score >= 0.9 ? "critical" : score >= 0.7 ? "high" : "medium";
  if (msg.ai_status === "warn") return score >= 0.6 ? "medium" : "low";
  return "none";
}

/** Derive recommended action from legacy messages that lack structured AI fields. */
function deriveRecommendedAction(msg: MessageRecord): string {
  if (msg.ai_recommended_action) return msg.ai_recommended_action;
  const severity = deriveSeverity(msg);
  if (
    msg.ai_status === "flagged" &&
    (severity === "critical" || severity === "high")
  )
    return "delete";
  if (msg.ai_status === "flagged") return "review";
  if (msg.ai_status === "warn") return "warn";
  return "none";
}

function isAutoDeleteEligible(message: MessageRecord): boolean {
  if (message.ai_status !== "flagged" && message.ai_status !== "warn")
    return false;

  const confidence = message.ai_confidence ?? message.ai_moderation_score ?? 0;
  if (confidence < config.AUTO_DELETE_MIN_CONFIDENCE) {
    logger.debug(
      {
        messageId: message.id,
        confidence,
        threshold: config.AUTO_DELETE_MIN_CONFIDENCE,
      },
      "Auto-delete skipped: confidence below threshold",
    );
    return false;
  }

  const severity = deriveSeverity(message);
  const allowedSeverities = (config.AUTO_DELETE_ALLOWED_SEVERITIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedSeverities.length > 0 && !allowedSeverities.includes(severity)) {
    logger.debug(
      { messageId: message.id, severity, allowed: allowedSeverities },
      "Auto-delete skipped: severity not in allowed list",
    );
    return false;
  }

  const recommendedAction = deriveRecommendedAction(message);
  if (recommendedAction !== "delete" && recommendedAction !== "escalate") {
    logger.debug(
      { messageId: message.id, recommendedAction },
      "Auto-delete skipped: recommended action is not delete/escalate",
    );
    return false;
  }

  const allowedCategories = parseStringList(
    config.AUTO_DELETE_ALLOWED_CATEGORIES,
  );
  if (allowedCategories.length > 0) {
    const messageCategories = parseStringList(
      message.ai_categories ?? message.ai_moderation_flags,
    );
    const hasAllowedCategory = messageCategories.some((cat) =>
      allowedCategories.includes(cat),
    );
    if (!hasAllowedCategory) {
      logger.debug(
        {
          messageId: message.id,
          categories: messageCategories,
          allowed: allowedCategories,
        },
        "Auto-delete skipped: no allowed categories match",
      );
      return false;
    }
  }

  const excludedChannels = parseStringList(
    config.AUTO_DELETE_EXCLUDED_CHANNEL_IDS,
  );
  if (excludedChannels.length > 0) {
    const channelId = message.thread_id ?? message.channel_id;
    if (excludedChannels.includes(channelId)) {
      logger.debug(
        { messageId: message.id, channelId },
        "Auto-delete skipped: channel excluded",
      );
      return false;
    }
  }

  const excludedUsers = parseStringList(config.AUTO_DELETE_EXCLUDED_USER_IDS);
  if (excludedUsers.length > 0 && excludedUsers.includes(message.user_id)) {
    logger.debug(
      { messageId: message.id, userId: message.user_id },
      "Auto-delete skipped: user excluded",
    );
    return false;
  }

  return true;
}

async function logAutoDeleteAttempt(
  message: MessageRecord,
  result: AutoDeleteResult,
): Promise<void> {
  try {
    await createModerationAction({
      message_id: message.id,
      user_id: message.user_id,
      guild_id: message.guild_id,
      action_type: "delete_message",
      reason: result.reason,
      executed_by: "auto-delete-manager",
      status: result.deleted
        ? "executed"
        : result.reason === "dry_run"
          ? "executed"
          : "failed",
      error: result.reason === "error" ? result.reason : null,
      executed_at:
        result.deleted || result.reason === "dry_run" ? Date.now() : null,
    });
  } catch (error) {
    logger.warn(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist auto-delete action log",
    );
  }
}

export interface AutoDeleteResult {
  deleted: boolean;
  skipped: boolean;
  reason: string;
}

function getErrorCode(error: unknown): number | string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeCode = (error as { code?: number | string }).code;
  const maybeStatus = (error as { status?: number | string }).status;
  return maybeCode ?? maybeStatus;
}

function isAlreadyDeletedError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === 10008 || code === 404 || code === "10008" || code === "404";
}

function hasChannelMessagesApi(channel: unknown): channel is {
  messages: {
    fetch: (id: string) => Promise<{ delete: () => Promise<unknown> }>;
  };
} {
  return Boolean(
    channel &&
      typeof channel === "object" &&
      "messages" in channel &&
      (channel as { messages?: unknown }).messages &&
      typeof (channel as { messages: { fetch?: unknown } }).messages.fetch ===
        "function",
  );
}

function hasPermissionApi(channel: unknown): channel is {
  permissionsFor: (
    member: unknown,
  ) => { has: (permission: string) => boolean } | null;
} {
  return Boolean(
    channel &&
      typeof channel === "object" &&
      "permissionsFor" in channel &&
      typeof (channel as { permissionsFor?: unknown }).permissionsFor ===
        "function",
  );
}

export async function attemptAutoDeleteFlaggedMessage(
  client: Client | undefined,
  message: MessageRecord,
): Promise<AutoDeleteResult> {
  if (!config.AUTO_DELETE_FLAGGED_ENABLED) {
    return { deleted: false, skipped: true, reason: "disabled" };
  }

  if (message.ai_status !== "flagged" && message.ai_status !== "warn") {
    logger.debug(
      { messageId: message.id, status: message.ai_status },
      "Auto-delete skipped: message not flagged or warned",
    );
    const result = {
      deleted: false,
      skipped: true,
      reason: "not_flagged_or_warn",
    } as AutoDeleteResult;
    await logAutoDeleteAttempt(message, result);
    return result;
  }

  if (!isAutoDeleteEligible(message)) {
    logger.debug(
      { messageId: message.id },
      "Auto-delete skipped: not eligible (confidence/severity/action/category filter)",
    );
    const result = {
      deleted: false,
      skipped: true,
      reason: "not_eligible",
    } as AutoDeleteResult;
    await logAutoDeleteAttempt(message, result);
    return result;
  }

  if (!client?.user?.id) {
    logger.warn(
      { messageId: message.id },
      "Auto-delete skipped: client user missing",
    );
    return { deleted: false, skipped: true, reason: "client_user_missing" };
  }

  try {
    const guild = client.guilds.cache.get(message.guild_id);
    if (!guild) {
      logger.warn(
        { messageId: message.id, guildId: message.guild_id },
        "Auto-delete skipped: guild not found",
      );
      return { deleted: false, skipped: true, reason: "guild_not_found" };
    }

    const channelId = message.thread_id ?? message.channel_id;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      logger.warn(
        { messageId: message.id, channelId },
        "Auto-delete skipped: channel not found",
      );
      return { deleted: false, skipped: true, reason: "channel_not_found" };
    }

    if (!hasPermissionApi(channel) || !hasChannelMessagesApi(channel)) {
      logger.warn(
        { messageId: message.id, channelId },
        "Auto-delete skipped: channel cannot delete messages",
      );
      return { deleted: false, skipped: true, reason: "unsupported_channel" };
    }

    const selfMember = await guild.members.fetch(client.user.id);
    const permissions = channel.permissionsFor(selfMember);
    const canManageMessages =
      permissions?.has("MANAGE_MESSAGES" as PermissionString) ?? false;

    if (!canManageMessages) {
      logger.warn(
        { messageId: message.id, channelId, userId: client.user.id },
        "Auto-delete skipped: current user lacks Manage Messages",
      );
      return {
        deleted: false,
        skipped: true,
        reason: "missing_manage_messages",
      };
    }

    if (config.AUTO_DELETE_FLAGGED_DRY_RUN) {
      const result = {
        deleted: false,
        skipped: true,
        reason: "dry_run",
      } as AutoDeleteResult;
      await logAutoDeleteAttempt(message, result);
      logger.info(
        { messageId: message.id, channelId },
        "Auto-delete dry-run: would delete flagged message",
      );
      return result;
    }

    const discordMessage = await channel.messages.fetch(message.id);
    await discordMessage.delete();

    // ── Notify user via DM ──
    if (config.AUTO_DELETE_NOTIFY_USER) {
      try {
        const targetUser = await client.users.fetch(message.user_id);
        if (targetUser) {
          const reason = message.ai_categories ?? message.ai_moderation_flags ?? "(unknown)";
          await targetUser.send(
            `Pesan Anda di **${guild.name}** telah dihapus oleh sistem moderasi otomatis.\n` +
            `Alasan: ${reason}\n` +
            `Jika Anda merasa ini adalah kesalahan, silakan hubungi admin server.`,
          );
        }
      } catch (dmErr) {
        // DM might fail if user has DMs disabled — not critical
        logger.debug(
          { messageId: message.id, userId: message.user_id, error: String(dmErr) },
          "Failed to send DM notification for auto-deleted message",
        );
      }
    }

    // ── Log to moderation channel ──
    if (config.AUTO_DELETE_LOG_CHANNEL_ID) {
      try {
        const logChannel = guild.channels.cache.get(config.AUTO_DELETE_LOG_CHANNEL_ID);
        if (logChannel && "send" in logChannel && typeof (logChannel as any).send === "function") {
          const severity = message.ai_severity ?? "none";
          const categories = message.ai_categories ?? message.ai_moderation_flags ?? "—";
          const snippet = (message.edited_content ?? message.content).substring(0, 200);
          await (logChannel as any).send(
            `**🧹 Auto-Delete** — Pesan dari <@${message.user_id}> di <#${channelId}>\n` +
            `**Status:** ${message.ai_status}\n` +
            `**Severitas:** ${severity}\n` +
            `**Kategori:** ${categories}\n` +
            `**Isi:** ${snippet}\n` +
            `**Waktu:** <t:${Math.floor(Date.now() / 1000)}:R>`,
          );
        }
      } catch (logErr) {
        logger.warn(
          { messageId: message.id, error: String(logErr) },
          "Failed to log auto-delete to moderation channel",
        );
      }
    }

    const result = {
      deleted: true,
      skipped: false,
      reason: "deleted",
    } as AutoDeleteResult;
    await logAutoDeleteAttempt(message, result);
    logger.info(
      { messageId: message.id, channelId },
      "Auto-deleted AI-flagged message",
    );
    return result;
  } catch (error) {
    if (isAlreadyDeletedError(error)) {
      const result = {
        deleted: true,
        skipped: false,
        reason: "already_deleted",
      } as AutoDeleteResult;
      await logAutoDeleteAttempt(message, result);
      logger.info(
        { messageId: message.id, code: getErrorCode(error) },
        "Auto-delete skipped: message already deleted",
      );
      return result;
    }

    const result = {
      deleted: false,
      skipped: true,
      reason: "error",
    } as AutoDeleteResult;
    await logAutoDeleteAttempt(message, result);
    logger.error(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
        code: getErrorCode(error),
      },
      "Auto-delete failed",
    );
    return result;
  }
}

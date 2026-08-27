import type { Client, PermissionString } from "discord.js-selfbot-v13";
import { LRUCache } from "lru-cache";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { messageStore } from "../message-capture/messageStore.js";
import type { MessageRecord } from "../message-capture/types.js";
import {
  isEligibleForAutoDelete,
  isNicknameOnlyViolation,
} from "./autoDeleteEligibility.js";
import { logDeletionToChannel } from "./autoDeleteLogger.js";
import { sendDeletionNotification } from "./autoDeleteNotify.js";
import { llmChat } from "./llmClient.js";
import { verdictToActionFields } from "./verdictToActionFields.js";

const logger = createChildLogger("auto-delete-manager");

export interface AutoDeleteResult {
  deleted: boolean;
  skipped: boolean;
  reason: string;
}

// Cooldown per guild:user — a nick violation fires per message, but the
// Discord PATCH is idempotent; hammering it on every message by the same
// member is wasteful and risks rate limits.
const recentNicknameResets = new LRUCache<string, number>({
  max: 200,
  ttl: config.AUTO_NICKNAME_RESET_COOLDOWN_MS ?? 10 * 60 * 1000,
});

export function isNicknameResetInCooldown(
  guildId: string,
  userId: string,
): boolean {
  return recentNicknameResets.has(`${guildId}:${userId}`);
}

/**
 * Resets a member's server nickname to the default (global username) —
 * Discord's `setNickname(null)` removes the custom nick so the member is
 * shown under their default username. Non-blocking; failures are logged
 * but never throw into the moderation pipeline.
 */
export async function resetOffensiveNickname(
  client: Client | undefined,
  guildId: string,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const cooldownKey = `${guildId}:${userId}`;
  try {
    if (!client?.user?.id) {
      logger.warn(
        { messageId, guildId, userId },
        "Nick reset skipped: client missing",
      );
      return false;
    }
    if (userId === client.user.id) {
      logger.debug({ userId }, "Nick reset skipped: operator's own account");
      return false;
    }
    if (recentNicknameResets.has(cooldownKey)) {
      logger.debug({ guildId, userId }, "Nick reset skipped: cooldown active");
      return false;
    }
    if (config.AUTO_NICKNAME_RESET_ENABLED === false) return false;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(
        { messageId, guildId },
        "Nick reset skipped: guild not found",
      );
      return false;
    }
    const member = await guild.members.fetch(userId);
    // Discord rejects setNickname with "Missing Permissions" (code 50013)
    // whenever the target's top role sits above the bot in the role
    // hierarchy — even when the bot has MANAGE_NICKNAMES. Guard on
    // `manageable` (hierarchy-aware) so we skip with a clear reason
    // instead of hammering a doomed PATCH on every message.
    if (!member.manageable) {
      logger.debug(
        {
          messageId,
          guildId,
          userId,
          reason: "target role above bot in hierarchy (Discord 50013)",
        },
        "Nick reset skipped: member not manageable by bot",
      );
      return false;
    }
    // setNickname(null) = remove nickname → Discord shows global username
    await member.setNickname(null, "[auto] nickname melanggar aturan server");

    // ── Check if the global username is ALSO offensive ──────────────
    // After reset, the member shows their global username. If that is
    // also offensive (gambling/scam keywords), replace it with a random
    // generated username so the user can't circumvent the filter by
    // having an offensive global username.
    const refreshedMember = await guild.members.fetch(userId);
    const globalUsername = refreshedMember.user?.username ?? "";
    if (await isGlobalUsernameOffensiveAI(globalUsername)) {
      const randomName = generateRandomUsername();
      await refreshedMember.setNickname(
        randomName,
        "[auto] global username juga melanggar, diganti random",
      );
      logger.info(
        { messageId, guildId, userId, globalUsername, randomName },
        "Global username also offensive — replaced with random username",
      );
    }

    recentNicknameResets.set(cooldownKey, Date.now());
    logger.info(
      { messageId, guildId, userId },
      "Offensive nickname reset to default username",
    );
    return true;
  } catch (error) {
    const errCode =
      error instanceof Error && "code" in error
        ? (error as { code?: number | string }).code
        : undefined;
    logger.warn(
      {
        messageId,
        guildId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        code: errCode,
      },
      "Nick reset failed",
    );
    return false;
  }
}

// ─── AI-Based Global Username Check ──────────────────────────────────

/**
 * Ask the AI moderation LLM whether a global username is offensive
 * (gambling, scam, spam, NSFW, etc.). Returns `true` if the LLM
 * judges the username as violating server rules.
 *
 * Fail-open: if the LLM call fails or times out, returns `false`
 * so the nickname reset still completes — we don't want a broken LLM
 * to block enforcement.
 */
async function isGlobalUsernameOffensiveAI(username: string): Promise<boolean> {
  try {
    const completion = await llmChat({
      messages: [
        {
          role: "system",
          content:
            'Kamu adalah moderator Discord. Tentukan apakah username berikut melanggar aturan server (judi, togel, scam, spam, NSFW, SARA, atau ofensif). Jawab HANYA dengan JSON: {"offensive": true} atau {"offensive": false}. Jangan penjelasan tambahan.',
        },
        {
          role: "user",
          content: `Username: "${username}"`,
        },
      ],
      max_tokens: 50,
      temperature: 0,
      stream: false,
      timeout: 10_000,
    });

    const content = completion?.choices?.[0]?.message?.content?.trim() ?? "";
    // Parse JSON response — handle both strict JSON and markdown-wrapped
    const jsonMatch = content.match(
      /\{[^}]*"offensive"\s*:\s*(true|false)[^}]*\}/,
    );
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { offensive: boolean };
      return parsed.offensive === true;
    }
    // Fallback: if response contains "true" anywhere, treat as offensive
    return content.toLowerCase().includes("true");
  } catch (error) {
    logger.warn(
      {
        username,
        error: error instanceof Error ? error.message : String(error),
      },
      "AI username check failed — failing open (not offensive)",
    );
    return false;
  }
}

/**
 * Generate a random fallback username: "User" + 5-digit number.
 * Guaranteed unique per call (random suffix).
 */
function generateRandomUsername(): string {
  const suffix = Math.floor(10000 + Math.random() * 90000);
  return `User${suffix}`;
}

// ─── Error Handling Utilities ────────────────────────────────────────

function getErrorCode(error: unknown): number | string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeCode = (error as { code?: number | string }).code;
  const maybeStatus = (error as { status?: number | string }).status;
  return maybeCode ?? maybeStatus;
}

function isAlreadyDeletedError(error: unknown): boolean {
  const code = getErrorCode(error);
  // Discord REST error codes for "message not found":
  //   10008 = Unknown Message, 10003 = Unknown Channel,
  //   50001 = Missing Access (channel deleted/hidden), 404 = HTTP
  if (
    code === 10008 ||
    code === 10003 ||
    code === 50001 ||
    code === 404 ||
    code === "10008" ||
    code === "10003" ||
    code === "50001" ||
    code === "404"
  )
    return true;
  // Fallback: check the message text for the Discord "Unknown Message" string
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return msg.includes("Unknown Message") || msg.includes("Unknown Channel");
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

// ─── Database Action Log ─────────────────────────────────────────────

async function logAutoDeleteAttempt(
  message: MessageRecord,
  result: AutoDeleteResult,
  serverName?: string | null,
): Promise<void> {
  try {
    await messageStore.createModerationAction({
      message_id: message.id,
      user_id: message.user_id,
      guild_id: message.guild_id,
      action_type: "delete_message",
      reason: result.reason,
      ...verdictToActionFields(message),
      username: message.username,
      server_name: serverName ?? null,
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

// ─── Main Orchestrator ───────────────────────────────────────────────

export async function attemptAutoDeleteFlaggedMessage(
  client: Client | undefined,
  message: MessageRecord,
): Promise<AutoDeleteResult> {
  logger.debug({ messageId: message.id }, "Processing message for auto-delete");

  // ── Config gate ──────────────────────────────────────────────────

  if (!config.AUTO_DELETE_FLAGGED_ENABLED) {
    logger.debug({ messageId: message.id }, "Auto-delete disabled by config");
    return { deleted: false, skipped: true, reason: "disabled" };
  }

  // ── Nickname-only violation: reset nick, DO NOT delete ─────────────
  // When the only flag is offensive_username (message content is clean),
  // the problem is the server nickname, not the message. Enforcement is
  // removing the nickname back to the default username — the message stays.
  if (isNicknameOnlyViolation(message)) {
    if (
      !config.AUTO_DELETE_FLAGGED_DRY_RUN &&
      config.AUTO_NICKNAME_RESET_ENABLED !== false
    ) {
      const inCooldown = isNicknameResetInCooldown(
        message.guild_id,
        message.user_id,
      );
      if (!inCooldown) {
        const resetOk = await resetOffensiveNickname(
          client,
          message.guild_id,
          message.user_id,
          message.id,
        );
        try {
          await messageStore.createModerationAction({
            message_id: message.id,
            user_id: message.user_id,
            guild_id: message.guild_id,
            action_type: "reset_nickname",
            reason:
              "nickname melanggar aturan server (offensive_username); pesan dibiarkan",
            ...verdictToActionFields(message),
            username: message.username,
            server_name: null,
            executed_by: "auto-delete-manager",
            status: resetOk ? "executed" : "failed",
            error: resetOk ? null : "nickname_reset_failed",
            executed_at: resetOk ? Date.now() : null,
          });
        } catch (error) {
          logger.warn(
            {
              messageId: message.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Failed to persist nickname reset action log",
          );
        }
      }
    }
    logger.info(
      { messageId: message.id, userId: message.user_id },
      "Nickname-only violation: message kept, nickname reset attempted",
    );
    return { deleted: false, skipped: true, reason: "nickname_only_violation" };
  }

  // ── Status gate ──────────────────────────────────────────────────

  if (message.ai_status !== "flagged" && message.ai_status !== "warn") {
    logger.debug(
      { messageId: message.id, status: message.ai_status },
      "Auto-delete skipped: message not flagged or warned",
    );
    const result: AutoDeleteResult = {
      deleted: false,
      skipped: true,
      reason: "not_flagged_or_warn",
    };
    await logAutoDeleteAttempt(message, result);
    return result;
  }

  // ── Eligibility gate ─────────────────────────────────────────────

  if (!isEligibleForAutoDelete(message)) {
    logger.debug(
      { messageId: message.id },
      "Auto-delete skipped: not eligible (confidence/severity/action/category filter)",
    );
    const result: AutoDeleteResult = {
      deleted: false,
      skipped: true,
      reason: "not_eligible",
    };
    await logAutoDeleteAttempt(message, result);
    return result;
  }

  // ── Client check ─────────────────────────────────────────────────

  if (!client?.user?.id) {
    logger.warn(
      { messageId: message.id },
      "Auto-delete skipped: client user missing",
    );
    return { deleted: false, skipped: true, reason: "client_user_missing" };
  }

  // ── Deletion flow ────────────────────────────────────────────────

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

    // ── Dry run mode ───────────────────────────────────────────────

    if (config.AUTO_DELETE_FLAGGED_DRY_RUN) {
      const result: AutoDeleteResult = {
        deleted: false,
        skipped: true,
        reason: "dry_run",
      };
      await logAutoDeleteAttempt(message, result, guild.name);
      logger.info(
        { messageId: message.id, channelId },
        "Auto-delete dry-run: would delete flagged message",
      );
      return result;
    }

    // ── Perform API deletion ───────────────────────────────────────

    const discordMessage = await channel.messages.fetch(message.id);
    await discordMessage.delete();
    logger.info(
      { messageId: message.id, channelId },
      "Message deleted from Discord",
    );

    // ── Notify user via DM ─────────────────────────────────────────

    await sendDeletionNotification(client, message, guild.name);

    // ── Log to moderation channel ──────────────────────────────────

    await logDeletionToChannel(guild, message, channelId);

    // ── Success ────────────────────────────────────────────────────

    const result: AutoDeleteResult = {
      deleted: true,
      skipped: false,
      reason: "deleted",
    };
    await logAutoDeleteAttempt(message, result, guild.name);
    logger.info(
      { messageId: message.id, channelId },
      "Auto-deleted AI-flagged message",
    );
    return result;
  } catch (error) {
    // ── Already deleted ──────────────────────────────────────────────

    if (isAlreadyDeletedError(error)) {
      const result: AutoDeleteResult = {
        deleted: true,
        skipped: false,
        reason: "already_deleted",
      };
      await logAutoDeleteAttempt(message, result);
      logger.info(
        { messageId: message.id, code: getErrorCode(error) },
        "Auto-delete skipped: message already deleted",
      );
      return result;
    }

    // ── Unexpected error ─────────────────────────────────────────────

    const result: AutoDeleteResult = {
      deleted: false,
      skipped: true,
      reason: "error",
    };
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

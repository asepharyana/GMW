import { and, eq, isNull, lt } from "drizzle-orm";
import { getDatabase } from "../database/drizzle.js";
import {
  attachmentsTable,
  messagesTable,
  retentionPoliciesTable,
  voiceRecordingsTable,
} from "../database/schema.js";
import { createChildLogger } from "../logger.js";
import { getRetentionPolicy } from "./messageStore.js";
import type { RetentionPolicy } from "./types.js";

const logger = createChildLogger("retention-manager");

interface RetentionResult {
  messagesDeleted: number;
  attachmentsDeleted: number;
  voiceRecordingsDeleted: number;
  error?: string;
}

/**
 * Executes retention policy for a guild
 * Deletes messages, attachments, and voice recordings older than retention_days
 */
export async function executeRetentionPolicy(
  guildId: string,
): Promise<RetentionResult> {
  const result: RetentionResult = {
    messagesDeleted: 0,
    attachmentsDeleted: 0,
    voiceRecordingsDeleted: 0,
  };

  try {
    const policy = await getRetentionPolicy(guildId);
    if (!policy || !policy.enabled) {
      logger.debug({ guildId }, "Retention policy not enabled");
      return result;
    }

    const db = getDatabase() as any;
    const cutoffTime = Date.now() - policy.retention_days * 24 * 60 * 60 * 1000;

    // Delete old messages
    const deletedMessages = await db
      .delete(messagesTable)
      .where(
        and(
          eq(messagesTable.guild_id, guildId),
          lt(messagesTable.created_at, cutoffTime),
          isNull(messagesTable.deleted_at),
        ),
      );

    result.messagesDeleted = deletedMessages.rowsAffected || 0;

    // Delete old attachments if policy applies
    if (policy.apply_to_media) {
      const deletedAttachments = await db
        .delete(attachmentsTable)
        .where(
          and(
            eq(attachmentsTable.guild_id, guildId),
            lt(attachmentsTable.created_at, cutoffTime),
          ),
        );

      result.attachmentsDeleted = deletedAttachments.rowsAffected || 0;
    }

    // Delete old voice recordings if policy applies
    if (policy.apply_to_voice) {
      const deletedVoice = await db
        .delete(voiceRecordingsTable)
        .where(
          and(
            eq(voiceRecordingsTable.guild_id, guildId),
            lt(voiceRecordingsTable.created_at, cutoffTime),
          ),
        );

      result.voiceRecordingsDeleted = deletedVoice.rowsAffected || 0;
    }

    logger.info(
      {
        guildId,
        retentionDays: policy.retention_days,
        ...result,
      },
      "Retention policy executed",
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { guildId, error: message },
      "Failed to execute retention policy",
    );
    result.error = message;
    return result;
  }
}

/**
 * Executes retention policies for all enabled guilds
 * Returns summary of deletions
 */
export async function executeAllRetentionPolicies(): Promise<{
  policiesExecuted: number;
  totalMessagesDeleted: number;
  totalAttachmentsDeleted: number;
  totalVoiceDeleted: number;
  errors: Array<{ guildId: string; error: string }>;
}> {
  const summary = {
    policiesExecuted: 0,
    totalMessagesDeleted: 0,
    totalAttachmentsDeleted: 0,
    totalVoiceDeleted: 0,
    errors: [] as Array<{ guildId: string; error: string }>,
  };

  try {
    const db = getDatabase() as any;
    const policies = await db
      .select()
      .from(retentionPoliciesTable)
      .where(eq(retentionPoliciesTable.enabled, true));

    for (const policy of policies as RetentionPolicy[]) {
      const result = await executeRetentionPolicy(policy.guild_id);
      summary.policiesExecuted++;
      summary.totalMessagesDeleted += result.messagesDeleted;
      summary.totalAttachmentsDeleted += result.attachmentsDeleted;
      summary.totalVoiceDeleted += result.voiceRecordingsDeleted;

      if (result.error) {
        summary.errors.push({
          guildId: policy.guild_id,
          error: result.error,
        });
      }
    }

    logger.info(summary, "All retention policies executed");
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: message },
      "Failed to execute all retention policies",
    );
    throw error;
  }
}

/**
 * Starts a periodic retention policy executor
 * Runs every 24 hours by default
 */
export function startRetentionPolicyWorker(
  intervalMs: number = 24 * 60 * 60 * 1000,
): NodeJS.Timeout {
  logger.info({ intervalMs }, "Starting retention policy worker");

  const interval = setInterval(async () => {
    try {
      await executeAllRetentionPolicies();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Retention policy worker failed",
      );
    }
  }, intervalMs);

  return interval;
}

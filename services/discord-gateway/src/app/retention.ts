import { createChildLogger } from "@/shared/logger/index";
import { inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "../shared/config/config.js";
import { getDatabase } from "../shared/database/drizzle.js";
import type * as schema from "../shared/database/schema.js";
import {
  attachmentsTable,
  messagesTable,
  voiceRecordingsTable,
} from "../shared/database/schema.js";

const logger = createChildLogger("discord-gateway");

// ─── Retention Cleanup ─────────────────────────────────────────────────────

async function deleteExpiredRecords(
  table: any,
  timestampField: any,
  days: number | undefined,
  dryRun: boolean,
  label: string,
): Promise<void> {
  if (!days || days <= 0) {
    logger.debug({ label }, `Retention disabled for ${label}`);
    return;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = getDatabase() as unknown as NodePgDatabase<typeof schema>;

  const expired = await db
    .select({ id: table.id })
    .from(table)
    .where(lt(timestampField, cutoff))
    .limit(1000);

  if (expired.length === 0) {
    logger.debug({ label }, `No expired ${label} found`);
    return;
  }

  logger.info({ count: expired.length, label }, `Found expired ${label}`);

  if (dryRun) {
    logger.info(
      { count: expired.length, label },
      `[DRY RUN] Would delete ${expired.length} ${label}`,
    );
    return;
  }

  try {
    await db.delete(table).where(
      inArray(
        table.id,
        expired.map((r) => r.id),
      ),
    );
    logger.info({ count: expired.length, label }, `Deleted expired ${label}`);
  } catch (err) {
    logger.error({ err, label }, `Failed to delete expired ${label}`);
  }
}

function startRetentionCleanup(): void {
  const intervalMs = config.RETENTION_CLEANUP_INTERVAL_MS;
  const dryRun = config.RETENTION_DRY_RUN;

  logger.info(
    {
      intervalMs,
      dryRun,
      messagesDays: config.RETENTION_MESSAGES_DAYS,
      attachmentsDays: config.RETENTION_ATTACHMENTS_DAYS,
      voiceDays: config.RETENTION_VOICE_DAYS,
    },
    "Starting retention cleanup scheduler",
  );

  async function runCleanupTick(): Promise<void> {
    await deleteExpiredRecords(
      messagesTable,
      messagesTable.created_at,
      config.RETENTION_MESSAGES_DAYS,
      dryRun,
      "messages",
    );
    await deleteExpiredRecords(
      attachmentsTable,
      attachmentsTable.created_at,
      config.RETENTION_ATTACHMENTS_DAYS,
      dryRun,
      "attachments",
    );
    await deleteExpiredRecords(
      voiceRecordingsTable,
      voiceRecordingsTable.created_at,
      config.RETENTION_VOICE_DAYS,
      dryRun,
      "voice recordings",
    );
  }

  // Run immediately on start, then schedule
  runCleanupTick().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Initial retention cleanup tick failed",
    );
  });

  setInterval(() => {
    runCleanupTick().catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Retention cleanup tick failed",
      );
    });
  }, intervalMs);
}

export { startRetentionCleanup };

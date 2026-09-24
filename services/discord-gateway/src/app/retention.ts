import { inArray, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../shared/config/index.js";
import { getDatabase } from "../shared/database/drizzle.js";
import type * as schema from "../shared/database/schema.js";
import { attachmentsTable, messagesTable } from "../shared/database/schema.js";

const logger = createChildLogger("discord-gateway");

/** DB handle typed with the full schema so table/column refs resolve. */
type GatewayDatabase = NodePgDatabase<typeof schema>;

/** Tables eligible for retention cleanup: string `id` + numeric `created_at`. */
type RetentionTable = typeof messagesTable | typeof attachmentsTable;

type RetentionTimestampColumn =
  | typeof messagesTable.created_at
  | typeof attachmentsTable.created_at;

// ─── Retention Cleanup ─────────────────────────────────────────────────────

/**
 * Delete rows older than `days` in `table`, in batches of up to 1000 ids.
 * When `dryRun` is set, logs what would be deleted without deleting.
 * Returns immediately (no-op) when `days` is unset or <= 0.
 */
async function deleteExpiredRecords(
  table: RetentionTable,
  timestampField: RetentionTimestampColumn,
  days: number | undefined,
  dryRun: boolean,
  label: string,
): Promise<void> {
  if (!days || days <= 0) {
    logger.debug({ label }, `Retention disabled for ${label}`);
    return;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const db = getDatabase() as unknown as GatewayDatabase;

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

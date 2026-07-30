import { createChildLogger, type Logger } from "@/shared/logger/index";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import type { MessageRecord } from "../message-capture/types.js";

// ─── MessagesCleanup Class ────────────────────────────────────────────────────

export class MessagesCleanup {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("messages-cleanup");
  }

  async getExpiredMessages(retentionDays: number): Promise<MessageRecord[]> {
    if (retentionDays <= 0) return [];
    this.logger.debug({ retentionDays }, "getExpiredMessages entry");
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(
          and(
            sql`${messagesTable.created_at} < ${cutoffTime}`,
            isNull(messagesTable.deleted_at),
          ),
        )
        .limit(1000);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          retentionDays,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get expired messages",
      );
      throw error;
    }
  }

  async revertStuckProcessingMessages(
    timeoutMs: number = 300000,
  ): Promise<number> {
    this.logger.debug({ timeoutMs }, "revertStuckProcessingMessages entry");
    try {
      const cutoffTime = Date.now() - timeoutMs;

      const rows = await this.db
        .update(messagesTable)
        .set({ ai_status: "pending", ai_analyzed_at: null })
        .where(
          and(
            eq(messagesTable.ai_status, "processing"),
            sql`${messagesTable.ai_analyzed_at} < ${cutoffTime}`,
          ),
        )
        .returning({ id: messagesTable.id });

      if (Array.isArray(rows) && rows.length > 0) {
        this.logger.info(
          {
            count: rows.length,
            messageIds: rows.map((r: { id: string }) => r.id),
          },
          "Reverted stuck processing messages back to pending",
        );
      }

      return Array.isArray(rows) ? rows.length : 0;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to revert stuck processing messages",
      );
      return 0;
    }
  }
}

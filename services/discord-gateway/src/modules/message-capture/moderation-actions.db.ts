import { createChildLogger, type Logger } from "@bete/shared/logger";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { moderationActionsTable } from "../../shared/database/schema.js";
import { decodeCursor, encodeCursor } from "../message-capture/pagination.js";
import type { ModerationAction, PageResult } from "../message-capture/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function pageRows<T extends { created_at: number; id: string }>(
  rows: unknown[],
  limit: number,
): PageResult<T> {
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit) as T[];
  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({ created_at: lastItem.created_at, id: lastItem.id })
      : null;

  return { data, nextCursor };
}

// ─── ModerationActionsDb Class ──────────────────────────────────────────────

export class ModerationActionsDb {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("moderation-actions-db");
  }

  async createModerationAction(
    action: Omit<ModerationAction, "id" | "created_at">,
  ): Promise<ModerationAction> {
    this.logger.debug(
      { guildId: action.guild_id },
      "createModerationAction entry",
    );
    try {
      const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const created_at = Date.now();

      const rows = await this.db
        .insert(moderationActionsTable)
        .values({
          ...action,
          id,
          created_at,
        })
        .returning();

      return rows[0] as ModerationAction;
    } catch (error) {
      this.logger.error(
        {
          guildId: action.guild_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to create moderation action",
      );
      throw error;
    }
  }

  async getModerationAction(id: string): Promise<ModerationAction | null> {
    this.logger.debug({ actionId: id }, "getModerationAction entry");
    try {
      const rows = await this.db
        .select()
        .from(moderationActionsTable)
        .where(eq(moderationActionsTable.id, id));

      return (rows[0] as ModerationAction) || null;
    } catch (error) {
      this.logger.error(
        {
          actionId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get moderation action",
      );
      throw error;
    }
  }

  async listModerationActions(query: {
    guildId?: string;
    status?: string[];
    cursor?: string;
    limit: number;
  }): Promise<PageResult<ModerationAction>> {
    this.logger.debug({ query }, "listModerationActions entry");
    try {
      const limit = Math.max(1, Math.min(query.limit || 50, 100));
      const conditions: SQL[] = [];

      if (query.guildId) {
        conditions.push(eq(moderationActionsTable.guild_id, query.guildId));
      }
      if (query.status && query.status.length > 0) {
        conditions.push(
          sql`${moderationActionsTable.status} in ${query.status}`,
        );
      }

      const cursorData = decodeCursor(query.cursor);
      if (cursorData) {
        conditions.push(
          sql`(${moderationActionsTable.created_at} < ${cursorData.created_at} or (${moderationActionsTable.created_at} = ${cursorData.created_at} and ${moderationActionsTable.id} < ${cursorData.id}))`,
        );
      }

      const rows = await this.db
        .select()
        .from(moderationActionsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          desc(moderationActionsTable.created_at),
          desc(moderationActionsTable.id),
        )
        .limit(limit + 1);

      return pageRows<ModerationAction>(rows, limit);
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to list moderation actions",
      );
      throw error;
    }
  }

  async updateModerationAction(
    id: string,
    updates: Partial<Omit<ModerationAction, "id" | "created_at">>,
  ): Promise<ModerationAction | null> {
    this.logger.debug({ actionId: id }, "updateModerationAction entry");
    try {
      const rows = (await this.db
        .update(moderationActionsTable)
        .set(updates)
        .where(eq(moderationActionsTable.id, id))
        .returning()) as ModerationAction[];

      return rows[0] || null;
    } catch (error) {
      this.logger.error(
        {
          actionId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update moderation action",
      );
      throw error;
    }
  }
}

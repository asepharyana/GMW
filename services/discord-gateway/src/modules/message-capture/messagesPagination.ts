import { buildCursorCondition, pageResult } from "../../shared/index.js";
import { createChildLogger, type Logger } from "../../shared/logger/index.js";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import type {
  MessageQuery,
  MessageRecord,
  PageResult,
} from "../message-capture/types.js";
import { channelOrThreadCondition } from "./messagesCrud.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildListMessageConditions(query: MessageQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.guildId) {
    conditions.push(eq(messagesTable.guild_id, query.guildId));
  }

  if (query.channelId) {
    conditions.push(channelOrThreadCondition(query.channelId));
  }

  if (query.threadId) {
    conditions.push(eq(messagesTable.thread_id, query.threadId));
  }

  if (query.userId) {
    conditions.push(eq(messagesTable.user_id, query.userId));
  }

  if (query.status && query.status.length > 0) {
    conditions.push(
      inArray(
        messagesTable.ai_status,
        query.status as Array<
          "pending" | "processing" | "clean" | "warn" | "flagged" | "error"
        >,
      ),
    );
  }

  if (query.q) {
    const pattern = `%${query.q.toLowerCase()}%`;
    conditions.push(sql`lower(${messagesTable.content}) like ${pattern}`);
  }

  const cursorCondition = buildCursorCondition(
    messagesTable.created_at,
    messagesTable.id,
    query.cursor,
  );
  if (cursorCondition) {
    conditions.push(cursorCondition);
  }

  return conditions;
}

// ─── MessagesPagination Class ────────────────────────────────────────────────

export class MessagesPagination {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("messages-pagination");
  }

  async listMessages(query: MessageQuery): Promise<PageResult<MessageRecord>> {
    this.logger.debug({ query }, "listMessages entry");
    try {
      const conditions = buildListMessageConditions(query);
      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
        .limit(query.limit + 1);

      return pageResult<MessageRecord>(rows, query.limit);
    } catch (error) {
      this.logger.error(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to list messages",
      );
      throw error;
    }
  }

  async listReviewMessages(
    query: Omit<MessageQuery, "status">,
  ): Promise<PageResult<MessageRecord>> {
    return this.listMessages({
      ...query,
      status: ["warn", "flagged", "error"],
    });
  }
}

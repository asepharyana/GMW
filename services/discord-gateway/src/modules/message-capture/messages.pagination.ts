import { decodeCursor, encodeCursor, pageResult } from "@bete/shared";
import { createChildLogger, type Logger } from "@bete/shared/logger";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import type {
  MessageQuery,
  MessageRecord,
  PageResult,
} from "../message-capture/types.js";
import { channelOrThreadCondition } from "./messages.crud.js";

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
    conditions.push(sql`${messagesTable.ai_status} in ${query.status}`);
  }

  if (query.q) {
    const pattern = `%${query.q.toLowerCase()}%`;
    conditions.push(sql`lower(${messagesTable.content}) like ${pattern}`);
  }

  const cursorData = decodeCursor(query.cursor);
  if (cursorData) {
    conditions.push(
      sql`(${messagesTable.created_at} < ${cursorData.created_at} or (${messagesTable.created_at} = ${cursorData.created_at} and ${messagesTable.id} < ${cursorData.id}))`,
    );
  }

  return conditions;
}

const pageRows = pageResult;

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

      return pageRows<MessageRecord>(rows, query.limit);
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

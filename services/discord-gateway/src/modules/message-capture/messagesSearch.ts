import { and, desc, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createChildLogger, type Logger } from "@/shared/logger/index";
import type * as schema from "../../shared/database/schema.js";
import { messagesTable } from "../../shared/database/schema.js";
import type { MessageRecord } from "../message-capture/types.js";
import { channelOrThreadCondition } from "./messagesCrud.js";

// ─── MessagesSearch Class ─────────────────────────────────────────────────────

export class MessagesSearch {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("messages-search");
  }

  async searchMessages(input: {
    query: string;
    channelId?: string;
    guildId?: string;
    limit?: number;
  }): Promise<MessageRecord[]> {
    this.logger.debug({ query: input.query }, "searchMessages entry");
    try {
      const { query, channelId, guildId, limit = 20 } = input;

      const searchPattern = `%${query}%`;
      const conditions: (SQL | undefined)[] = [
        isNull(messagesTable.deleted_at),
      ];

      if (guildId) {
        conditions.push(eq(messagesTable.guild_id, guildId));
      }

      if (channelId) {
        conditions.push(channelOrThreadCondition(channelId));
      }

      conditions.push(
        or(
          sql`lower(${messagesTable.content}) LIKE ${searchPattern}`,
          sql`lower(${messagesTable.edited_content}) LIKE ${searchPattern}`,
        ),
      );

      const validConditions = conditions.filter(
        (c): c is SQL => c !== undefined,
      );

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(and(...validConditions))
        .orderBy(desc(messagesTable.created_at))
        .limit(limit);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          query: input.query,
          channelId: input.channelId,
          guildId: input.guildId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to search messages",
      );
      throw error;
    }
  }
}

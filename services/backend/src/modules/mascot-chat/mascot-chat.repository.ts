import { pgMascotChatMessagesTable, pgMessagesTable } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";

const logger = createChildLogger("mascot-chat.repository");

export interface MascotChatContext {
  messageCount?: number;
  activeParticipants?: number;
  lastActivity?: string;
  topicsDiscussed?: string[];
  guildId?: string;
  channelId?: string;
}

export interface SaveConversationInput {
  userId: string;
  userMessage: string;
  mascotResponse: string;
  context?: MascotChatContext;
  timestamp: Date;
}

export interface MascotChatHistoryRow {
  id: string;
  user_id: string;
  user_message: string;
  mascot_response: string;
  context: MascotChatContext | null;
  created_at: string;
}

export interface ServerInsights {
  total_messages: number;
  active_users: number;
  flagged: number;
  warned: number;
}

export class MascotChatRepository {
  async saveConversation(input: SaveConversationInput): Promise<void> {
    const db = getDatabase();

    await db.insert(pgMascotChatMessagesTable).values({
      user_id: input.userId,
      user_message: input.userMessage,
      mascot_response: input.mascotResponse,
      context: (input.context ?? {}) as Record<string, unknown>,
      created_at: input.timestamp,
    });

    logger.debug({ userId: input.userId }, "Conversation saved");
  }

  async getChatHistory(
    userId: string,
    limit: number,
  ): Promise<MascotChatHistoryRow[]> {
    const db = getDatabase();

    const rows = await db
      .select()
      .from(pgMascotChatMessagesTable)
      .where(eq(pgMascotChatMessagesTable.user_id, userId))
      .orderBy(desc(pgMascotChatMessagesTable.created_at))
      .limit(limit);

    logger.debug({ userId, count: rows.length }, "Chat history fetched");
    return rows.reverse() as unknown as MascotChatHistoryRow[];
  }

  async clearChatHistory(userId: string): Promise<void> {
    const db = getDatabase();

    const deleted = await db
      .delete(pgMascotChatMessagesTable)
      .where(eq(pgMascotChatMessagesTable.user_id, userId))
      .returning({ id: pgMascotChatMessagesTable.id });

    logger.info(
      { userId, deletedRows: deleted.length },
      "Chat history cleared",
    );
  }

  async getServerInsights(
    guildId?: string,
    channelId?: string,
  ): Promise<ServerInsights> {
    try {
      const db = getDatabase();
      const conditions: SQL[] = [];

      if (guildId) {
        conditions.push(eq(pgMessagesTable.guild_id, guildId));
      }
      if (channelId) {
        conditions.push(eq(pgMessagesTable.channel_id, channelId));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [result] = await db
        .select({
          total_messages: sql<number>`COUNT(*)::int`,
          active_users: sql<number>`COUNT(DISTINCT ${pgMessagesTable.user_id})::int`,
          flagged: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'flagged')::int`,
          warned: sql<number>`COUNT(*) FILTER (WHERE ${pgMessagesTable.ai_status} = 'warn')::int`,
        })
        .from(pgMessagesTable)
        .where(where);

      const insights = result ?? {
        total_messages: 0,
        active_users: 0,
        flagged: 0,
        warned: 0,
      };

      logger.debug({ guildId, channelId, insights }, "Server insights fetched");
      return insights;
    } catch (error) {
      logger.warn(
        { error, guildId, channelId },
        "Failed to load server insights",
      );
      return {
        total_messages: 0,
        active_users: 0,
        flagged: 0,
        warned: 0,
      };
    }
  }
}

export const mascotChatRepository = new MascotChatRepository();

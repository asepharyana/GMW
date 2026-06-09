import { createChildLogger } from "@bete/shared/logger";
import { getPool } from "../../shared/database/index.js";

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
    const pool = getPool();

    await pool.query(
      `
        INSERT INTO mascot_chat_messages
          (user_id, user_message, mascot_response, context, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [
        input.userId,
        input.userMessage,
        input.mascotResponse,
        JSON.stringify(input.context ?? {}),
        input.timestamp.toISOString(),
      ],
    );

    logger.debug({ userId: input.userId }, "Conversation saved");
  }

  async getChatHistory(
    userId: string,
    limit: number,
  ): Promise<MascotChatHistoryRow[]> {
    const pool = getPool();

    const { rows } = await pool.query<MascotChatHistoryRow>(
      `
        SELECT id, user_id, user_message, mascot_response, context, created_at
        FROM mascot_chat_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [userId, limit],
    );

    logger.debug({ userId, count: rows.length }, "Chat history fetched");
    return rows.reverse();
  }

  async clearChatHistory(userId: string): Promise<void> {
    const pool = getPool();

    const { rowCount } = await pool.query(
      `DELETE FROM mascot_chat_messages WHERE user_id = $1`,
      [userId],
    );

    logger.info({ userId, deletedRows: rowCount ?? 0 }, "Chat history cleared");
  }

  async getServerInsights(
    guildId?: string,
    channelId?: string,
  ): Promise<ServerInsights> {
    const pool = getPool();

    try {
      const params: string[] = [];
      const clauses: string[] = [];

      if (guildId) {
        params.push(guildId);
        clauses.push(`guild_id = $${params.length}`);
      }
      if (channelId) {
        params.push(channelId);
        clauses.push(`channel_id = $${params.length}`);
      }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const { rows } = await pool.query<ServerInsights>(
        `
          SELECT
            COUNT(*)::int AS total_messages,
            COUNT(DISTINCT user_id)::int AS active_users,
            COUNT(*) FILTER (WHERE ai_status = 'flagged')::int AS flagged,
            COUNT(*) FILTER (WHERE ai_status = 'warn')::int AS warned
          FROM messages
          ${where}
        `,
        params,
      );

      const insights = rows[0] ?? {
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

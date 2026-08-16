import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import { pgChatbotMessagesTable, pgMessagesTable } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";

const logger = createChildLogger("chatbot.repository");

export interface ChatbotContext {
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
  botResponse: string;
  context?: ChatbotContext;
  timestamp: Date;
}

export interface ChatbotHistoryRow {
  id: string;
  user_id: string;
  user_message: string;
  bot_response: string;
  context: ChatbotContext | null;
  created_at: string;
}

export class ChatbotRepository {
  async saveConversation(input: SaveConversationInput): Promise<void> {
    const db = getDatabase();

    await db.insert(pgChatbotMessagesTable).values({
      user_id: input.userId,
      user_message: input.userMessage,
      bot_response: input.botResponse,
      context: (input.context ?? {}) as Record<string, unknown>,
      created_at: input.timestamp,
    });

    logger.debug({ userId: input.userId }, "Conversation saved");
  }

  async getChatHistory(
    userId: string,
    limit: number,
  ): Promise<ChatbotHistoryRow[]> {
    const db = getDatabase();

    const rows = await db
      .select()
      .from(pgChatbotMessagesTable)
      .where(eq(pgChatbotMessagesTable.user_id, userId))
      .orderBy(desc(pgChatbotMessagesTable.created_at))
      .limit(limit);

    logger.debug({ userId, count: rows.length }, "Chat history fetched");
    return rows.reverse() as unknown as ChatbotHistoryRow[];
  }

  async clearChatHistory(userId: string): Promise<void> {
    const db = getDatabase();

    const deleted = await db
      .delete(pgChatbotMessagesTable)
      .where(eq(pgChatbotMessagesTable.user_id, userId))
      .returning({ id: pgChatbotMessagesTable.id });

    logger.info(
      { userId, deletedRows: deleted.length },
      "Chat history cleared",
    );
  }
}

export const chatbotRepository = new ChatbotRepository();

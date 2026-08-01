import { and, desc, eq, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createChildLogger, type Logger } from "@/shared/logger/index";
import type * as schema from "../../shared/database/schema.js";
import {
  messageEditsTable,
  messagesTable,
} from "../../shared/database/schema.js";
import type { MessageRecord } from "../message-capture/types.js";

type MessageInsert = typeof messagesTable.$inferInsert;

// ─── Shared Helpers ──────────────────────────────────────────────────────────

export function channelOrThreadCondition(
  channelId: string,
  table?: { channel_id: any; thread_id: any },
): SQL {
  const t = table ?? messagesTable;
  return or(eq(t.channel_id, channelId), eq(t.thread_id, channelId)) as SQL;
}

// ─── MessagesCrud Class ──────────────────────────────────────────────────────

export class MessagesCrud {
  private logger: Logger;

  constructor(
    protected db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = _parentLogger ?? createChildLogger("messages-crud");
  }

  // ── INSERT ──────────────────────────────────────────────────────────────────

  async insertMessage(message: MessageRecord): Promise<void> {
    this.logger.debug({ messageId: message.id }, "insertMessage entry");
    try {
      await this.db
        .insert(messagesTable)
        .values(message as MessageInsert)
        .onConflictDoNothing();
    } catch (error) {
      this.logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to insert message",
      );
      throw error;
    }
  }

  async upsertMessageForCapture(message: MessageRecord): Promise<boolean> {
    this.logger.debug(
      { messageId: message.id },
      "upsertMessageForCapture entry",
    );
    try {
      const messageWithAIStatus = {
        ...message,
        ai_status: "pending" as const,
      };

      const rows = await this.db
        .insert(messagesTable)
        .values(messageWithAIStatus as MessageInsert)
        .onConflictDoNothing()
        .returning({ id: messagesTable.id });

      return rows.length > 0;
    } catch (error) {
      this.logger.error(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to upsert message for capture",
      );
      throw error;
    }
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  async updateMessageAsEdited(
    messageId: string,
    editedContent: string,
    editedAt: number,
  ): Promise<void> {
    this.logger.debug({ messageId }, "updateMessageAsEdited entry");
    try {
      await this.db
        .update(messagesTable)
        .set({
          edited_content: editedContent,
          edited_at: editedAt,
          type: "edited",
          ai_status: "pending",
          ai_moderation_flags: null,
          ai_moderation_score: null,
          ai_analysis: null,
          ai_categories: null,
          ai_severity: null,
          ai_confidence: null,
          ai_recommended_action: null,
          ai_analyzed_at: null,
          ai_error: null,
        })
        .where(eq(messagesTable.id, messageId));
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message as edited",
      );
      throw error;
    }
  }

  async updateMessageAsDeleted(
    messageId: string,
    deletedAt: number,
  ): Promise<void> {
    this.logger.debug({ messageId }, "updateMessageAsDeleted entry");
    try {
      await this.db
        .update(messagesTable)
        .set({
          deleted_at: deletedAt,
          type: "deleted",
        })
        .where(eq(messagesTable.id, messageId));
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message as deleted",
      );
      throw error;
    }
  }

  // ── EDIT HISTORY ──────────────────────────────────────────────────────────────

  async insertMessageEdit(
    messageId: string,
    oldContent: string,
    editedAt: number,
  ): Promise<void> {
    this.logger.debug({ messageId }, "insertMessageEdit entry");
    try {
      await this.db
        .insert(messageEditsTable)
        .values({
          message_id: messageId,
          old_content: oldContent,
          edited_at: editedAt,
        })
        .onConflictDoNothing();
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to insert message edit",
      );
      throw error;
    }
  }

  // ── GET ─────────────────────────────────────────────────────────────────────

  async getMessagesByChannel(
    channelId: string,
    limit: number = 50,
    offset: number = 0,
    guildId?: string,
  ): Promise<MessageRecord[]> {
    this.logger.debug(
      { channelId, limit, offset, guildId },
      "getMessagesByChannel entry",
    );
    try {
      const conditions: SQL[] = [channelOrThreadCondition(channelId)];

      if (guildId) {
        conditions.push(eq(messagesTable.guild_id, guildId));
      }

      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(and(...conditions))
        .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
        .limit(limit)
        .offset(offset);

      return rows as MessageRecord[];
    } catch (error) {
      this.logger.error(
        {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get messages by channel",
      );
      throw error;
    }
  }

  async getMessageById(messageId: string): Promise<MessageRecord | null> {
    this.logger.debug({ messageId }, "getMessageById entry");
    try {
      const rows = await this.db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.id, messageId));

      return (rows[0] as MessageRecord) ?? null;
    } catch (error) {
      this.logger.error(
        {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get message by id",
      );
      throw error;
    }
  }
}

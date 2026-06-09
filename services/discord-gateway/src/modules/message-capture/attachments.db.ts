import { createChildLogger, type Logger } from "@bete/shared/logger";
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { attachmentsTable } from "../../shared/database/schema.js";
import type { AttachmentRecord } from "../message-capture/types.js";

// ─── AttachmentsDb Class ────────────────────────────────────────────────────

export class AttachmentsDb {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("attachments-db");
  }

  async insertAttachment(attachment: AttachmentRecord): Promise<void> {
    this.logger.debug(
      { attachmentId: attachment.id },
      "insertAttachment entry",
    );
    try {
      await this.db
        .insert(attachmentsTable)
        .values(attachment)
        .onConflictDoNothing();
    } catch (error) {
      this.logger.error(
        {
          attachmentId: attachment.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to insert attachment",
      );
      throw error;
    }
  }

  async getAttachmentsByChannel(
    channelId: string,
    limit: number = 50,
    offset: number = 0,
    guildId?: string,
  ): Promise<AttachmentRecord[]> {
    this.logger.debug(
      { channelId, limit, offset },
      "getAttachmentsByChannel entry",
    );
    try {
      const conditions: SQL[] = [
        or(
          eq(attachmentsTable.channel_id, channelId),
          eq(attachmentsTable.thread_id, channelId),
        ) as SQL,
      ];

      if (guildId) {
        conditions.push(eq(attachmentsTable.guild_id, guildId));
      }

      const rows = await this.db
        .select()
        .from(attachmentsTable)
        .where(and(...conditions))
        .orderBy(desc(attachmentsTable.created_at))
        .limit(limit)
        .offset(offset);

      return rows as AttachmentRecord[];
    } catch (error) {
      this.logger.error(
        {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get attachments by channel",
      );
      throw error;
    }
  }

  async updateAttachmentAsUploaded(
    attachmentId: string,
    uploadedUrl: string,
    uploadedAt: number,
  ): Promise<void> {
    this.logger.debug({ attachmentId }, "updateAttachmentAsUploaded entry");
    try {
      await this.db
        .update(attachmentsTable)
        .set({
          uploaded_url: uploadedUrl,
          upload_status: "uploaded",
          uploaded_at: uploadedAt,
        })
        .where(eq(attachmentsTable.id, attachmentId));
    } catch (error) {
      this.logger.error(
        {
          attachmentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update attachment as uploaded",
      );
      throw error;
    }
  }

  async updateAttachmentDiscordUrl(
    attachmentId: string,
    discordUrl: string,
  ): Promise<void> {
    this.logger.debug({ attachmentId }, "updateAttachmentDiscordUrl entry");
    try {
      await this.db
        .update(attachmentsTable)
        .set({ discord_url: discordUrl })
        .where(eq(attachmentsTable.id, attachmentId));
    } catch (error) {
      this.logger.error(
        {
          attachmentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update attachment Discord URL",
      );
      throw error;
    }
  }

  async updateAttachmentAsFailedUpload(
    attachmentId: string,
    error: string,
  ): Promise<void> {
    this.logger.debug({ attachmentId }, "updateAttachmentAsFailedUpload entry");
    try {
      await this.db
        .update(attachmentsTable)
        .set({
          upload_status: "failed",
          upload_error: error,
        })
        .where(eq(attachmentsTable.id, attachmentId));
    } catch (error) {
      this.logger.error(
        {
          attachmentId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update attachment as failed",
      );
      throw error;
    }
  }

  async getAttachmentsForMessages(
    messageIds: string[],
  ): Promise<AttachmentRecord[]> {
    this.logger.debug(
      { messageIdsCount: messageIds.length },
      "getAttachmentsForMessages entry",
    );
    try {
      if (messageIds.length === 0) return [];
      const rows = await this.db
        .select()
        .from(attachmentsTable)
        .where(inArray(attachmentsTable.message_id, messageIds));

      return rows as AttachmentRecord[];
    } catch (error) {
      this.logger.error(
        {
          messageIds,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get attachments for messages",
      );
      throw error;
    }
  }
}

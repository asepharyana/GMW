import { buildCursorCondition, pageResult } from "../../shared/index.js";
import { createChildLogger, type Logger } from "../../shared/logger/index.js";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { messageReviewsTable } from "../../shared/database/schema.js";
import type { MessageReview, PageResult } from "../message-capture/types.js";

// ─── ReviewsDb Class ────────────────────────────────────────────────────────

export class ReviewsDb {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("reviews-db");
  }

  async createMessageReview(
    review: Omit<MessageReview, "id" | "created_at">,
  ): Promise<MessageReview> {
    this.logger.debug(
      { messageId: review.message_id },
      "createMessageReview entry",
    );
    try {
      const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const created_at = Date.now();

      const rows = await this.db
        .insert(messageReviewsTable)
        .values({
          ...review,
          id,
          created_at,
        })
        .returning();

      return rows[0] as MessageReview;
    } catch (error) {
      this.logger.error(
        {
          messageId: review.message_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to create message review",
      );
      throw error;
    }
  }

  async getMessageReview(id: string): Promise<MessageReview | null> {
    this.logger.debug({ reviewId: id }, "getMessageReview entry");
    try {
      const rows = await this.db
        .select()
        .from(messageReviewsTable)
        .where(eq(messageReviewsTable.id, id));

      return (rows[0] as MessageReview) || null;
    } catch (error) {
      this.logger.error(
        {
          reviewId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get message review",
      );
      throw error;
    }
  }

  async listMessageReviews(query: {
    guildId?: string;
    channelId?: string;
    status?: string[];
    cursor?: string;
    limit: number;
  }): Promise<PageResult<MessageReview>> {
    this.logger.debug({ query }, "listMessageReviews entry");
    try {
      const limit = Math.max(1, Math.min(query.limit || 50, 100));
      const conditions: SQL[] = [];

      if (query.guildId) {
        conditions.push(eq(messageReviewsTable.guild_id, query.guildId));
      }
      if (query.channelId) {
        conditions.push(eq(messageReviewsTable.channel_id, query.channelId));
      }
      if (query.status && query.status.length > 0) {
        conditions.push(
          inArray(
            messageReviewsTable.status,
            query.status as Array<"pending" | "approved" | "rejected" | "escalated">,
          ),
        );
      }

      const cursorCondition = buildCursorCondition(
        messageReviewsTable.created_at,
        messageReviewsTable.id,
        query.cursor,
      );
      if (cursorCondition) {
        conditions.push(cursorCondition);
      }

      const rows = await this.db
        .select()
        .from(messageReviewsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          desc(messageReviewsTable.created_at),
          desc(messageReviewsTable.id),
        )
        .limit(limit + 1);

      return pageResult<MessageReview>(rows, limit);
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to list message reviews",
      );
      throw error;
    }
  }

  async updateMessageReview(
    id: string,
    updates: Partial<Omit<MessageReview, "id" | "created_at">>,
  ): Promise<MessageReview | null> {
    this.logger.debug({ reviewId: id }, "updateMessageReview entry");
    try {
      const rows = (await this.db
        .update(messageReviewsTable)
        .set(updates)
        .where(eq(messageReviewsTable.id, id))
        .returning()) as MessageReview[];

      return rows[0] || null;
    } catch (error) {
      this.logger.error(
        {
          reviewId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to update message review",
      );
      throw error;
    }
  }
}

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/database/drizzle";
import { createChildLogger } from "../../src/logger";
import {
  decodeCursor,
  encodeCursor,
  getAttachmentsForMessages,
  getMessageById,
  insertAttachment,
  insertMessage,
  listMessages,
  listReviewMessages,
  updateMessageAsEdited,
} from "../../src/moderation/messageStore";
import type { MessageRecord } from "../../src/moderation/types";
import {
  clearTestTables,
  getTestDatabase,
  initializeTestDatabase,
} from "../helpers/testDatabase";

const logger = createChildLogger("messageStoreQueries.test");

describe("message cursor helpers", () => {
  it("round-trips created_at and id", () => {
    const cursor = encodeCursor({ created_at: 1710000000000, id: "abc" });
    expect(decodeCursor(cursor)).toEqual({
      created_at: 1710000000000,
      id: "abc",
    });
  });

  it("returns null for invalid cursor", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
  });
});

describe("message query integration tests", () => {
  beforeAll(async () => {
    await initializeTestDatabase();
    // Create tables directly for isolated query integration tests
    const db = getTestDatabase();
    try {
      // Create messages table
      await db.run(`
        DROP TABLE IF EXISTS "attachments" CASCADE;
        DROP TABLE IF EXISTS "messages" CASCADE;
        CREATE TABLE IF NOT EXISTS "messages" (
          "id" text PRIMARY KEY NOT NULL,
          "guild_id" text NOT NULL,
          "channel_id" text NOT NULL,
          "thread_id" text,
          "user_id" text NOT NULL,
          "username" text NOT NULL,
          "avatar_url" text,
          "content" text NOT NULL,
          "edited_content" text,
          "created_at" bigint NOT NULL,
          "edited_at" bigint,
          "deleted_at" bigint,
          "type" text DEFAULT 'text' NOT NULL,
          "metadata" text,
          "ai_status" text DEFAULT 'pending' NOT NULL,
          "ai_moderation_flags" text,
          "ai_moderation_score" real,
          "ai_moderation_raw" text,
          "ai_categories" text,
          "ai_severity" text,
          "ai_confidence" real,
          "ai_recommended_action" text,
          "ai_analysis" text,
          "ai_analyzed_at" bigint,
          "ai_error" text
        )
      `);

      // Create attachments table
      await db.run(`
        DROP TABLE IF EXISTS "attachments";
        CREATE TABLE IF NOT EXISTS "attachments" (
          "id" text PRIMARY KEY NOT NULL,
          "message_id" text NOT NULL,
          "guild_id" text NOT NULL,
          "channel_id" text NOT NULL,
          "thread_id" text,
          "user_id" text NOT NULL,
          "filename" text NOT NULL,
          "size" integer NOT NULL,
          "type" text NOT NULL,
          "discord_url" text NOT NULL,
          "uploaded_url" text,
          "upload_status" text DEFAULT 'pending' NOT NULL,
          "upload_error" text,
          "created_at" bigint NOT NULL,
          "uploaded_at" bigint
        )
      `);
    } catch (error) {
      logger.debug({ error }, "Tables already exist or error creating them");
    }
  });

  beforeEach(async () => {
    // Clear tables before each test
    try {
      await clearTestTables("attachments", "messages");
    } catch (error) {
      logger.debug({ error }, "Could not clear tables");
    }
  });

  afterAll(async () => {
    try {
      await closeDatabase();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error closing database in afterAll",
      );
    }
  });

  describe("listMessages", () => {
    const createTestMessage = (
      overrides: Partial<MessageRecord> = {},
    ): MessageRecord => ({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      guild_id: "guild-123",
      channel_id: "channel-456",
      thread_id: null,
      user_id: "user-789",
      username: "testuser",
      avatar_url: null,
      content: "Test message",
      edited_content: null,
      created_at: Date.now(),
      edited_at: null,
      deleted_at: null,
      type: "text",
      metadata: null,
      ai_status: "pending",
      ...overrides,
    });

    it("returns messages in newest-first order", async () => {
      const now = Date.now();
      const msg1 = createTestMessage({
        id: "msg-1",
        created_at: now - 3000,
        content: "oldest",
      });
      const msg2 = createTestMessage({
        id: "msg-2",
        created_at: now - 2000,
        content: "middle",
      });
      const msg3 = createTestMessage({
        id: "msg-3",
        created_at: now - 1000,
        content: "newest",
      });

      await insertMessage(msg1);
      await insertMessage(msg2);
      await insertMessage(msg3);

      const result = await listMessages({
        channelId: "channel-456",
        limit: 10,
      });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].id).toBe("msg-3");
      expect(result.data[1].id).toBe("msg-2");
      expect(result.data[2].id).toBe("msg-1");
    });

    it("returns nextCursor when more results exist than limit", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert 5 messages
      for (let i = 0; i < 5; i++) {
        await insertMessage(
          createTestMessage({
            id: `msg-limit-${i}`,
            channel_id: channelId,
            created_at: now - i * 1000,
          }),
        );
      }

      const result = await listMessages({
        channelId,
        limit: 3,
      });

      expect(result.data).toHaveLength(3);
      expect(result.nextCursor).not.toBeNull();
    });

    it("returns null nextCursor when all results fit within limit", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert 2 messages
      for (let i = 0; i < 2; i++) {
        await insertMessage(
          createTestMessage({
            id: `msg-nomore-${i}`,
            channel_id: channelId,
            created_at: now - i * 1000,
          }),
        );
      }

      const result = await listMessages({
        channelId,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it("second page using nextCursor does not duplicate first page", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert 6 messages
      const messageIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = `msg-dup-${i}`;
        messageIds.push(id);
        await insertMessage(
          createTestMessage({
            id,
            channel_id: channelId,
            created_at: now - i * 1000,
          }),
        );
      }

      // Get first page
      const page1 = await listMessages({
        channelId,
        limit: 3,
      });

      expect(page1.data).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page1Ids = page1.data.map((m) => m.id);

      // Get second page using cursor
      const page2 = await listMessages({
        channelId,
        limit: 3,
        cursor: page1.nextCursor!,
      });

      expect(page2.data).toHaveLength(3);

      const page2Ids = page2.data.map((m) => m.id);

      // Verify no overlap
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);

      // Verify all messages are accounted for
      const allIds = [...page1Ids, ...page2Ids];
      expect(allIds.sort()).toEqual(messageIds.sort());
    });

    it("filters by channelId correctly", async () => {
      const now = Date.now();
      const channel1 = `channel-${Math.random().toString(36).slice(2)}`;
      const channel2 = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert messages in two channels
      await insertMessage(
        createTestMessage({
          id: "msg-ch1-1",
          channel_id: channel1,
          created_at: now,
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-ch2-1",
          channel_id: channel2,
          created_at: now,
        }),
      );

      const result = await listMessages({
        channelId: channel1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].channel_id).toBe(channel1);
    });

    it("filters by status correctly", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert messages with different statuses
      const msg1 = createTestMessage({
        id: "msg-status-1",
        channel_id: channelId,
        created_at: now,
        ai_status: "clean",
      });
      const msg2 = createTestMessage({
        id: "msg-status-2",
        channel_id: channelId,
        created_at: now - 1000,
        ai_status: "warn",
      });
      const msg3 = createTestMessage({
        id: "msg-status-3",
        channel_id: channelId,
        created_at: now - 2000,
        ai_status: "flagged",
      });

      await insertMessage(msg1);
      await insertMessage(msg2);
      await insertMessage(msg3);

      // Query for warn and flagged only
      const result = await listMessages({
        channelId,
        status: ["warn", "flagged"],
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((m) => m.id).sort()).toEqual(
        ["msg-status-2", "msg-status-3"].sort(),
      );
    });

    it("filters by channelId and status together", async () => {
      const now = Date.now();
      const channel1 = `channel-${Math.random().toString(36).slice(2)}`;
      const channel2 = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert messages in two channels with different statuses
      await insertMessage(
        createTestMessage({
          id: "msg-combo-1",
          channel_id: channel1,
          created_at: now,
          ai_status: "warn",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-combo-2",
          channel_id: channel1,
          created_at: now - 1000,
          ai_status: "clean",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-combo-3",
          channel_id: channel2,
          created_at: now - 2000,
          ai_status: "warn",
        }),
      );

      // Query for warn status in channel1 only
      const result = await listMessages({
        channelId: channel1,
        status: ["warn"],
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("msg-combo-1");
    });
  });

  describe("listReviewMessages", () => {
    const createTestMessage = (
      overrides: Partial<MessageRecord> = {},
    ): MessageRecord => ({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      guild_id: "guild-123",
      channel_id: "channel-456",
      thread_id: null,
      user_id: "user-789",
      username: "testuser",
      avatar_url: null,
      content: "Test message",
      edited_content: null,
      created_at: Date.now(),
      edited_at: null,
      deleted_at: null,
      type: "text",
      metadata: null,
      ai_status: "pending",
      ...overrides,
    });

    it("defaults to warn, flagged, and error statuses", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert messages with all statuses
      await insertMessage(
        createTestMessage({
          id: "msg-review-1",
          channel_id: channelId,
          created_at: now,
          ai_status: "clean",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-review-2",
          channel_id: channelId,
          created_at: now - 1000,
          ai_status: "warn",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-review-3",
          channel_id: channelId,
          created_at: now - 2000,
          ai_status: "flagged",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-review-4",
          channel_id: channelId,
          created_at: now - 3000,
          ai_status: "error",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-review-5",
          channel_id: channelId,
          created_at: now - 4000,
          ai_status: "pending",
        }),
      );

      const result = await listReviewMessages({
        channelId,
        limit: 10,
      });

      expect(result.data).toHaveLength(3);
      const ids = result.data.map((m) => m.id).sort();
      expect(ids).toEqual(
        ["msg-review-2", "msg-review-3", "msg-review-4"].sort(),
      );
    });

    it("excludes clean status messages", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      await insertMessage(
        createTestMessage({
          id: "msg-clean-1",
          channel_id: channelId,
          created_at: now,
          ai_status: "clean",
        }),
      );
      await insertMessage(
        createTestMessage({
          id: "msg-clean-2",
          channel_id: channelId,
          created_at: now - 1000,
          ai_status: "warn",
        }),
      );

      const result = await listReviewMessages({
        channelId,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("msg-clean-2");
    });

    it("respects pagination with review messages", async () => {
      const now = Date.now();
      const channelId = `channel-${Math.random().toString(36).slice(2)}`;

      // Insert 5 review-worthy messages
      for (let i = 0; i < 5; i++) {
        await insertMessage(
          createTestMessage({
            id: `msg-review-page-${i}`,
            channel_id: channelId,
            created_at: now - i * 1000,
            ai_status: i % 2 === 0 ? "warn" : "flagged",
          }),
        );
      }

      const page1 = await listReviewMessages({
        channelId,
        limit: 2,
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await listReviewMessages({
        channelId,
        limit: 2,
        cursor: page1.nextCursor!,
      });

      expect(page2.data).toHaveLength(2);

      // Verify no overlap
      const page1Ids = page1.data.map((m) => m.id);
      const page2Ids = page2.data.map((m) => m.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe("updateMessageAsEdited", () => {
    const createTestMessage = (
      overrides: Partial<MessageRecord> = {},
    ): MessageRecord => ({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      guild_id: "guild-123",
      channel_id: "channel-456",
      thread_id: null,
      user_id: "user-789",
      username: "testuser",
      avatar_url: null,
      content: "Test message",
      edited_content: null,
      created_at: Date.now(),
      edited_at: null,
      deleted_at: null,
      type: "text",
      metadata: null,
      ai_status: "pending",
      ...overrides,
    });

    it("resets ai_status to pending and clears AI fields when message is edited", async () => {
      const messageId = `msg-edit-test-${Date.now()}`;
      const msg = createTestMessage({
        id: messageId,
        content: "original content",
        ai_status: "clean",
        ai_moderation_flags: "test_flag",
        ai_moderation_score: 0.5,
        ai_analysis: "This is clean",
        ai_analyzed_at: Date.now() - 10000,
        ai_error: null,
      });

      // Insert message with AI analysis already done
      await insertMessage(msg);

      // Verify initial state
      let retrieved = await getMessageById(messageId);
      expect(retrieved?.ai_status).toBe("clean");
      expect(retrieved?.ai_moderation_flags).toBe("test_flag");
      expect(retrieved?.ai_moderation_score).toBe(0.5);
      expect(retrieved?.ai_analysis).toBe("This is clean");

      // Edit the message
      await updateMessageAsEdited(messageId, "edited content", Date.now());

      // Verify AI fields are reset
      retrieved = await getMessageById(messageId);
      expect(retrieved?.edited_content).toBe("edited content");
      expect(retrieved?.type).toBe("edited");
      expect(retrieved?.ai_status).toBe("pending");
      expect(retrieved?.ai_moderation_flags).toBeNull();
      expect(retrieved?.ai_moderation_score).toBeNull();
      expect(retrieved?.ai_analysis).toBeNull();
      expect(retrieved?.ai_categories).toBeNull();
      expect(retrieved?.ai_severity).toBeNull();
      expect(retrieved?.ai_confidence).toBeNull();
      expect(retrieved?.ai_recommended_action).toBeNull();
      expect(retrieved?.ai_analyzed_at).toBeNull();
      expect(retrieved?.ai_error).toBeNull();
    });
  });

  describe("getAttachmentsForMessages", () => {
    it("returns attachments matching given message IDs", async () => {
      const msgId1 = "msg-att-1";
      const msgId2 = "msg-att-2";

      await insertMessage({
        id: msgId1,
        guild_id: "guild-123",
        channel_id: "channel-456",
        thread_id: null,
        user_id: "user-789",
        username: "testuser",
        avatar_url: null,
        content: "message with attachment 1",
        edited_content: null,
        created_at: Date.now(),
        edited_at: null,
        deleted_at: null,
        type: "text",
        metadata: null,
        ai_status: "pending",
      });
      await insertMessage({
        id: msgId2,
        guild_id: "guild-123",
        channel_id: "channel-456",
        thread_id: null,
        user_id: "user-789",
        username: "testuser",
        avatar_url: null,
        content: "message with attachment 2",
        edited_content: null,
        created_at: Date.now(),
        edited_at: null,
        deleted_at: null,
        type: "text",
        metadata: null,
        ai_status: "pending",
      });

      const attachment1 = {
        id: "att-1",
        message_id: msgId1,
        guild_id: "guild-123",
        channel_id: "channel-456",
        thread_id: null,
        user_id: "user-789",
        filename: "test1.png",
        size: 1024,
        type: "image/png",
        discord_url: "https://discord.com/test1.png",
        uploaded_url: "https://upload.asepharyana.tech/test1.png",
        upload_status: "uploaded" as const,
        upload_error: null,
        created_at: Date.now(),
        uploaded_at: Date.now(),
      };

      const attachment2 = {
        id: "att-2",
        message_id: msgId2,
        guild_id: "guild-123",
        channel_id: "channel-456",
        thread_id: null,
        user_id: "user-789",
        filename: "test2.png",
        size: 2048,
        type: "image/png",
        discord_url: "https://discord.com/test2.png",
        uploaded_url: "https://upload.asepharyana.tech/test2.png",
        upload_status: "uploaded" as const,
        upload_error: null,
        created_at: Date.now(),
        uploaded_at: Date.now(),
      };

      await insertAttachment(attachment1);
      await insertAttachment(attachment2);

      const result = await getAttachmentsForMessages([msgId1, msgId2]);
      expect(result).toHaveLength(2);
      const ids = result.map((r) => r.id).sort();
      expect(ids).toEqual(["att-1", "att-2"].sort());

      const emptyResult = await getAttachmentsForMessages([]);
      expect(emptyResult).toHaveLength(0);
    });
  });
});

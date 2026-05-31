import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDatabase } from "../../src/database/drizzle";
import {
  clearTestTables,
  getTestDatabase,
  initializeTestDatabase,
} from "../helpers/testDatabase";
import { captureMessage } from "../../src/moderation/messageCapture";
import type { ModerationBroadcaster } from "../../src/moderation/types";

const queueMessageAnalysis = vi.fn();

type TestMessage = Parameters<typeof captureMessage>[0];
type ModerationTestGlobal = typeof globalThis & {
  moderationBroadcaster?: Partial<ModerationBroadcaster>;
};

vi.mock("../../src/moderation/aiAnalyzer", () => ({
  queueMessageAnalysis: (id: string) => queueMessageAnalysis(id),
}));

function createMessage(id = "message-1"): TestMessage {
  return {
    id,
    guildId: "guild-1",
    channelId: "channel-1",
    author: {
      id: "user-1",
      username: "alice",
      bot: false,
      avatarURL: () => null,
    },
    content: "hello",
    cleanContent: "hello",
    createdTimestamp: 1_700_000_000_000,
    attachments: new Map(),
    stickers: new Map(),
    embeds: [],
    member: null,
    reference: null,
    channel: {
      id: "channel-1",
      name: "general",
      isThread: () => false,
    },
  } as unknown as TestMessage;
}

async function createTables() {
  const db = getTestDatabase();
  await db.run(`DROP TABLE IF EXISTS "attachments" CASCADE`);
  await db.run(`DROP TABLE IF EXISTS "messages" CASCADE`);
  await db.run(`
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
      "ai_analysis" text,
      "ai_categories" text,
      "ai_severity" text,
      "ai_confidence" real,
      "ai_recommended_action" text,
      "ai_analyzed_at" bigint,
      "ai_error" text
    )
  `);
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
}

describe("captureMessage", () => {
  beforeAll(async () => {
    await initializeTestDatabase();
    await createTables();
  });

  beforeEach(async () => {
    queueMessageAnalysis.mockClear();
    await clearTestTables("attachments", "messages");
    delete (globalThis as ModerationTestGlobal).moderationBroadcaster;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("does not requeue or rebroadcast a duplicate captured message", async () => {
    const message = createMessage();
    const messageCreated = vi.fn();
    (globalThis as ModerationTestGlobal).moderationBroadcaster = {
      messageCreated,
    };

    await captureMessage(message, "text");
    await captureMessage(message, "text");

    expect(queueMessageAnalysis).toHaveBeenCalledTimes(1);
    expect(messageCreated).toHaveBeenCalledTimes(1);
  });

  it("does not queue or broadcast backlog captures one message at a time", async () => {
    const message = createMessage("backlog-message-1");
    const messageCreated = vi.fn();
    (globalThis as ModerationTestGlobal).moderationBroadcaster = {
      messageCreated,
    };

    await captureMessage(message, "text", { source: "backlog" });

    expect(queueMessageAnalysis).not.toHaveBeenCalled();
    expect(messageCreated).not.toHaveBeenCalled();
  });
});

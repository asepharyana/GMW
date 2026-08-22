// ═══════════════════════════════════════════════════════════════════════════
// Context enrichment builders — bot/edited detection (pure, no DB)
// (buildUserHistoryXml / buildUserProfilesBlock were removed with the
// per-user context minimization; their tests went with them.)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  resolveIsBot,
  resolveIsEdited,
} from "../src/modules/ai-moderation/moderationBuilders.js";
import type { MessageRecord } from "../src/modules/message-capture/types.js";

const NOW = 1_800_000_000_000;

function msg(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "m1",
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: "u1",
    username: "user1",
    avatar_url: null,
    content: "hai",
    edited_content: null,
    created_at: NOW,
    edited_at: null,
    deleted_at: null,
    type: "text",
    is_reply: null,
    is_forward: null,
    is_crosspost: null,
    reference_message_id: null,
    reference_channel_id: null,
    reference_guild_id: null,
    metadata: null,
    ...overrides,
  };
}

describe("resolveIsBot / resolveIsEdited — message flags", () => {
  it("reads author.bot from captured metadata", () => {
    const bot = msg({
      metadata: JSON.stringify({
        author: { id: "x", username: "bot", bot: true },
      }),
    });
    const human = msg({
      metadata: JSON.stringify({
        author: { id: "y", username: "user", bot: false },
      }),
    });
    expect(resolveIsBot(bot)).toBe(true);
    expect(resolveIsBot(human)).toBe(false);
    expect(resolveIsBot(msg())).toBe(false);
  });

  it("flags edited content only when edited_content is present (the edit path)", () => {
    expect(resolveIsEdited(msg({ edited_content: "versi baru" }))).toBe(true);
    expect(resolveIsEdited(msg())).toBe(false);
  });
});

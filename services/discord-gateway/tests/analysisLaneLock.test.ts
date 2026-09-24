// ═══════════════════════════════════════════════════════════════════════════
// Analysis lane lock semantics (2026-09-24)
//
// The processing lock is PER-LANE: a conversation may hold a text lock AND a
// media lock simultaneously (they run on separate pools and finish
// independently). Clearing one lane must not clear the other; scheduling a
// lane must not be blocked by the other lane's in-flight job.
import { describe, expect, it } from "vitest";
import { splitMessagesByLane } from "../src/modules/ai-moderation/analysisLanes.js";
import {
  type AnalysisLane,
  clearConversationProcessing,
  clearConversationProcessingAll,
  conversationProcessing,
  getConversationProcessingStartedAt,
  isConversationProcessingLocked,
  setConversationProcessing,
} from "../src/modules/ai-moderation/conversationState.js";
import type { MessageRecord } from "../src/modules/message-capture/types.js";

function textMsg(id: string): MessageRecord {
  return {
    id,
    guild_id: "g",
    channel_id: "c",
    thread_id: null,
    user_id: "u",
    username: "u",
    avatar_url: null,
    content: `text-${id}`,
    edited_content: null,
    created_at: 1,
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
  };
}

function mediaMsg(id: string): MessageRecord {
  return {
    ...textMsg(id),
    metadata: JSON.stringify({
      attachments: [{ id: `att-${id}`, url: "https://cdn.example/x.png" }],
      stickers: [],
      embeds: [],
    }),
  };
}

describe("lane processing lock", () => {
  it("holds text and media lanes independently", () => {
    const key = "channel:1";
    const t0 = Date.now();
    const m0 = t0 + 1000;

    setConversationProcessing(key, "text", t0);
    expect(isConversationProcessingLocked(key, "text")).toBe(true);
    // Other lane is NOT locked by the text lock.
    expect(isConversationProcessingLocked(key, "media")).toBe(false);
    // Lane-agnostic check sees the conversation as processing.
    expect(isConversationProcessingLocked(key)).toBe(true);

    setConversationProcessing(key, "media", m0);
    expect(isConversationProcessingLocked(key, "media")).toBe(true);
    expect(isConversationProcessingLocked(key)).toBe(true);
    expect(getConversationProcessingStartedAt(key, "text")).toBe(t0);
    expect(getConversationProcessingStartedAt(key, "media")).toBe(m0);
  });

  it("clearing one lane preserves the other lane lock", () => {
    const key = "channel:2";
    const t0 = Date.now();
    setConversationProcessing(key, "text", t0);
    setConversationProcessing(key, "media", t0 + 500);

    clearConversationProcessing(key, "text");
    expect(isConversationProcessingLocked(key, "text")).toBe(false);
    expect(isConversationProcessingLocked(key, "media")).toBe(true);
    // Still locked overall (media held).
    expect(isConversationProcessingLocked(key)).toBe(true);

    clearConversationProcessing(key, "media");
    expect(isConversationProcessingLocked(key)).toBe(false);
    expect(conversationProcessing.has(key)).toBe(false);
  });

  it("clearConversationProcessingAll drops every lane", () => {
    const key = "channel:3";
    const t0 = Date.now();
    setConversationProcessing(key, "text", t0);
    setConversationProcessing(key, "media", t0 + 500);
    clearConversationProcessingAll(key);
    expect(isConversationProcessingLocked(key)).toBe(false);
    expect(conversationProcessing.has(key)).toBe(false);
  });

  it("does not clear a newer slot (ownership guard)", () => {
    const key = "channel:4";
    const t0 = Date.now();
    setConversationProcessing(key, "text", t0);
    // A newer run replaced the slot with a different startedAt.
    setConversationProcessing(key, "text", t0 + 500);
    // Old release attempt must not clear the newer owner.
    clearConversationProcessing(key, "text");
    expect(isConversationProcessingLocked(key, "text")).toBe(false);
    expect(conversationProcessing.has(key)).toBe(false);
  });
});

describe("splitMessagesByLane", () => {
  it("partitions by media content", () => {
    const { text, media } = splitMessagesByLane([
      textMsg("a"),
      mediaMsg("b"),
      textMsg("c"),
    ]);
    expect(text.map((m) => m.id)).toEqual(["a", "c"]);
    expect(media.map((m) => m.id)).toEqual(["b"]);
  });

  it("handles empty and all-one-lane inputs", () => {
    expect(splitMessagesByLane([])).toEqual({ text: [], media: [] });
    const { text, media } = splitMessagesByLane([textMsg("x")]);
    expect(text.length).toBe(1);
    expect(media.length).toBe(0);
  });

  it("lane type is a closed union", () => {
    const lanes: AnalysisLane[] = ["text", "media"];
    expect(lanes).toContain("text");
    expect(lanes).toContain("media");
  });
});

import { describe, expect, it } from "vitest";
import {
  pickBatchWithinBudget,
  type TokenEstimator,
} from "../src/modules/ai-moderation/batchBudget.js";
import type { MessageRecord } from "../src/modules/message-capture/types.js";

// Deterministic estimator: 1 token per character. Keeps the budget math
// exact regardless of tiktoken behavior (the real estimator is injected at
// the call site — see batchProcessor.ts).
const estimate: TokenEstimator = (text: string) => text.length;

function msg(id: string, content: string, createdAt: number): MessageRecord {
  return {
    id,
    guild_id: "g",
    channel_id: "c",
    thread_id: null,
    user_id: "u",
    username: "user",
    avatar_url: null,
    content,
    edited_content: null,
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
    type: "text",
    is_reply: false,
    is_forward: false,
    is_crosspost: false,
    reference_message_id: null,
    reference_channel_id: null,
    reference_guild_id: null,
    metadata: null,
  };
}

describe("pickBatchWithinBudget", () => {
  const TOKENS_PER_MESSAGE = 50;

  it("returns a contiguous chronological prefix — no gaps mid-timeline", () => {
    // sizes: 100, 100, 400 (overflow), 10
    const messages = [
      msg("m1", "a".repeat(100), 1),
      msg("m2", "b".repeat(100), 2),
      msg("m3", "c".repeat(400), 3),
      msg("m4", "d".repeat(10), 4),
    ];
    const batch = pickBatchWithinBudget(
      messages,
      500,
      TOKENS_PER_MESSAGE,
      estimate,
    );

    // m1(150)+m2(150)=300 fits; m3 would be 550 > 500 → stop.
    // m4 must NOT be picked even though it alone fits (no timeline gap).
    expect(batch.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("includes a message that exactly hits the budget", () => {
    const messages = [msg("m1", "a".repeat(450), 1)];
    const batch = pickBatchWithinBudget(
      messages,
      500,
      TOKENS_PER_MESSAGE,
      estimate,
    );
    expect(batch.map((m) => m.id)).toEqual(["m1"]);
  });

  it("returns empty when the first message alone exceeds the budget", () => {
    const messages = [
      msg("big", "x".repeat(1000), 1),
      msg("m2", "y".repeat(10), 2),
    ];
    const batch = pickBatchWithinBudget(
      messages,
      500,
      TOKENS_PER_MESSAGE,
      estimate,
    );
    expect(batch).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(
      pickBatchWithinBudget([], 500, TOKENS_PER_MESSAGE, estimate),
    ).toEqual([]);
  });
});

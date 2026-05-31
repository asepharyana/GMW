import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/moderation/indonesianTextNormalizer.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/moderation/indonesianTextNormalizer.js")
      >();
    return {
      ...actual,
      formatModerationTextEvidenceForPrompt: vi.fn(async (content: string) => {
        // Deterministic mock evidence — length tuned for the "tight budget" test:
        // maxTokens=300, target ~88, c3 ~108, c2 ~108, c1 ~108
        // Expectation: target+c3 fits (196), target+c3+c2 overflows (304)
        return '[text_evidence] categories=["offensive","profanity","sexual_violence"] severity=high confidence=0.92 language=id detected=badword normalized=false metadata_v2=true context=true';
      }),
    };
  },
);

import {
  buildConversationContext,
  estimateTokens,
  formatMessageForPrompt,
} from "../../src/moderation/conversationContext";
import type { MessageRecord } from "../../src/moderation/types";

beforeEach(() => {
  vi.clearAllMocks();
});

function message(
  id: string,
  content: string,
  created_at: number,
): MessageRecord {
  return {
    id,
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: `u-${id}`,
    username: `user-${id}`,
    avatar_url: null,
    content,
    edited_content: null,
    created_at,
    edited_at: null,
    deleted_at: null,
    type: "text",
    metadata: null,
    ai_status: "pending",
  };
}

describe("buildConversationContext", () => {
  it("returns only context lines (not targets) in chronological order", async () => {
    const lines = await buildConversationContext({
      contextBefore: [message("a", "hello", 1)],
      targets: [message("b", "bad?", 2)],
      maxTokens: 1000,
    });

    // Only context lines are returned
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[context] id=a");
    expect(lines[0]).toContain("user=user-a: hello");
  });

  it("formats target messages using edited content when present", async () => {
    const target = message("b", "original", 2);
    target.edited_content = "edited";

    const line = await formatMessageForPrompt(target, "target");
    expect(line).toContain("edited");
    expect(line).not.toContain("original");
  });

  it("empty targets and no context returns empty array", async () => {
    const lines = await buildConversationContext({
      contextBefore: [],
      targets: [],
      maxTokens: 1000,
    });
    expect(lines).toEqual([]);
  });

  it("returns context lines when targets are empty", async () => {
    const lines = await buildConversationContext({
      contextBefore: [message("a", "hello", 1)],
      targets: [],
      maxTokens: 1000,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[context]");
  });

  it("excludes context when target token budget consumes all available space", async () => {
    // Create targets that exceed budget
    const longContent = "x".repeat(500); // ~125 tokens
    const targets = [
      message("t1", longContent, 1),
      message("t2", longContent, 2),
      message("t3", longContent, 3),
    ];

    const lines = await buildConversationContext({
      contextBefore: [message("c1", "context", 0)],
      targets,
      maxTokens: 200, // Targets alone consume ~375 tokens, no room for context
    });

    // Context should be excluded due to budget
    expect(lines).toHaveLength(0);
  });

  it("most recent context is kept when context budget is tight", async () => {
    const contextBefore = [
      message(
        "c1",
        "oldest context with some extra words to make it longer",
        1000,
      ),
      message(
        "c2",
        "middle context with some extra words to make it longer",
        2000,
      ),
      message(
        "c3",
        "newest context with some extra words to make it longer",
        3000,
      ),
    ];

    const lines = await buildConversationContext({
      contextBefore,
      targets: [message("t1", "target message", 4000)],
      maxTokens: 300, // Target ~80 tokens, c3 ~100 tokens, fits c3
    });

    // Should include newest context (c3) but not oldest (c1)
    expect(lines.some((line) => line.includes("id=c3"))).toBe(true);
    expect(lines.some((line) => line.includes("id=c1"))).toBe(false);

    // Target lines should NOT be in the result (only context)
    expect(lines.some((line) => line.includes("[target]"))).toBe(false);
  });

  it("estimateTokens provides reasonable estimates", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
    expect(estimateTokens("x".repeat(300))).toBeGreaterThan(100);
  });
});

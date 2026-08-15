// ═══════════════════════════════════════════════════════════════════════════
// llmClient buildLlmParams — disable-thinking injection (pure, no network)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import { buildLlmParams } from "../src/modules/ai-moderation/llmClient.js";

const baseOpts = {
  messages: [{ role: "user" as const, content: "halo" }],
};

describe("buildLlmParams — disable-thinking injection", () => {
  it("injects no thinking-disabling params when disableThinking is false", () => {
    const params = buildLlmParams(baseOpts, false);
    expect((params as Record<string, unknown>).reasoning_effort).toBeUndefined();
    expect((params as Record<string, unknown>).reasoning).toBeUndefined();
    expect(
      (params as Record<string, unknown>).chat_template_kwargs,
    ).toBeUndefined();
  });

  it("injects all provider variants when disableThinking is true", () => {
    const params = buildLlmParams(baseOpts, true) as Record<string, unknown>;
    expect(params.reasoning_effort).toBe("none");
    expect(params.reasoning).toEqual({ enabled: false });
    expect(params.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(params.thinking).toEqual({ type: "disabled" });
  });

  it("keeps caller-supplied max_tokens / jsonResponse / stream intact", () => {
    const params = buildLlmParams(
      {
        ...baseOpts,
        max_tokens: 16384,
        stream: true,
        jsonResponse: { type: "json_object" },
      },
      true,
    );
    expect(params.max_tokens).toBe(16384);
    expect(params.stream).toBe(true);
    expect(params.response_format).toEqual({ type: "json_object" });
    // thinking-disabled params still present
    expect(
      (params as Record<string, unknown>).chat_template_kwargs,
    ).toEqual({ enable_thinking: false });
  });

  it("falls back to config default model when none supplied", () => {
    // config.AI_LLM_MODEL defaults to "text"
    const params = buildLlmParams(baseOpts, false);
    expect(params.model).toBe("text");
  });
});

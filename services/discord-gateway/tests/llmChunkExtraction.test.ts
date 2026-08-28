// ═══════════════════════════════════════════════════════════════════════════
// llmClient chunk extraction — reasoning_content fallback (pure, no network)
// ═══════════════════════════════════════════════════════════════════════════
// Regression: omniroute "multimodal" combo routed to cloudflare gemma-4-26b
// which streams ALL output in delta.reasoning_content with content:"" — the
// old extractor returned empty text → llmVision reported "Vision API null
// response" → every image moderation batch fell back to text-only analysis
// (LLM kept writing "Meskipun analisis gambar gagal").
import { describe, expect, it } from "vitest";
import { extractChunkText } from "../src/modules/ai-moderation/llmClient.js";

describe("extractChunkText — streaming chunk text extraction", () => {
  it("reads delta.content (standard OpenAI streaming)", () => {
    expect(
      extractChunkText({
        choices: [{ delta: { content: "halo" }, finish_reason: null }],
      }),
    ).toBe("halo");
  });

  it("falls back to delta.reasoning_content when content is empty — reasoning-only models (cloudflare gemma)", () => {
    // Exact shape seen from omniroute → cloudflare-ai/@cf/google/gemma-4-26b:
    // {"choices":[{"delta":{"content":"","reasoning_content":"Task","role":"assistant"},"finish_reason":null,...}]}
    expect(
      extractChunkText({
        choices: [
          {
            delta: { content: "", reasoning_content: "Task" },
            finish_reason: null,
          },
        ],
      }),
    ).toBe("Task");
  });

  it('falls back to delta.reasoning — mimo via omniroute streams reasoning there with content:""', () => {
  // Exact shape seen from omniroute → mimo-v2.5-free (2026-08-11):
    // {"choices":[{"delta":{"content":"","reasoning":"The user wants a","role":"assistant"},"finish_reason":null,...}]}
    expect(
      extractChunkText({
        choices: [
          {
            delta: { content: "", reasoning: "The user wants a" },
            finish_reason: null,
          },
        ],
      }),
    ).toBe("The user wants a");
  });

  it("joins delta.reasoning_details[].text when present", () => {
    expect(
      extractChunkText({
        choices: [
          {
            delta: {
              content: "",
              reasoning: "",
              reasoning_details: [
                { type: "reasoning.text", text: " detailed", index: 0 },
                { type: "reasoning.text", text: " description", index: 1 },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
    ).toBe(" detailed description");
  });

  it("prefers content over reasoning when both present (deepseek-style final answer)", () => {
    expect(
      extractChunkText({
        choices: [
          {
            delta: { content: "jawaban akhir", reasoning_content: "pikiran" },
            finish_reason: null,
          },
        ],
      }),
    ).toBe("jawaban akhir");
  });

  it("handles Anthropic-style message.content", () => {
    expect(extractChunkText({ message: { content: "via message" } })).toBe(
      "via message",
    );
  });

  it("handles top-level content / response fields (local LLM proxies)", () => {
    expect(extractChunkText({ content: "top-level" })).toBe("top-level");
    expect(extractChunkText({ response: "via response" })).toBe("via response");
  });

  it("returns empty string for null/undefined/empty chunks", () => {
    expect(extractChunkText(null)).toBe("");
    expect(extractChunkText(undefined)).toBe("");
    expect(extractChunkText({})).toBe("");
    expect(
      extractChunkText({
        choices: [{ delta: { content: "", reasoning_content: null } }],
      }),
    ).toBe("");
  });
});

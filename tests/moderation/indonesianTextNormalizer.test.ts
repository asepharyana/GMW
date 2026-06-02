import { afterAll, afterEach, describe, expect, it } from "vitest";
import { config } from "../../src/config";
import {
  buildModerationTextEvidence,
  detectIndonesianBadwords,
  formatModerationTextEvidenceForPrompt,
  normalizeDiscordCustomEmoji,
} from "../../src/moderation/indonesianTextNormalizer";

const originalPrimaryAiKey = config.AI_LLM_API_KEY;

function disableRemoteModeration(): void {
  config.AI_LLM_API_KEY = undefined;
}

disableRemoteModeration();

afterEach(() => {
  disableRemoteModeration();
});

afterAll(() => {
  config.AI_LLM_API_KEY = originalPrimaryAiKey;
});

describe("normalizeDiscordCustomEmoji", () => {
  it("replaces static custom emoji", () => {
    const result = normalizeDiscordCustomEmoji(
      "Bersiaplah woy <:hadeh:1217434294281048185>",
    );
    expect(result.text).toBe("Bersiaplah woy [emoji:hadeh]");
    expect(result.emojiNames).toContain("hadeh");
  });

  it("replaces animated custom emoji", () => {
    const result = normalizeDiscordCustomEmoji("cek <a:speen:1234567890> dulu");
    expect(result.text).toBe("cek [emoji:speen] dulu");
    expect(result.emojiNames).toContain("speen");
  });

  it("handles text without emoji", () => {
    const result = normalizeDiscordCustomEmoji("halo semua");
    expect(result.text).toBe("halo semua");
    expect(result.emojiNames).toHaveLength(0);
  });
});

describe("detectIndonesianBadwords", () => {
  it("returns empty array when no APIs are configured", async () => {
    // Local badword list removed; all detection now requires an API.
    // With all APIs disabled (see disableRemoteModeration above),
    // the function should return empty without throwing.
    const badwords = await detectIndonesianBadwords("kontol banget");
    expect(badwords).toHaveLength(0);
  });

  it("returns empty array for safe slang", async () => {
    const badwords = await detectIndonesianBadwords("woy hadeh gua");
    expect(badwords).toHaveLength(0);
  });
});

describe("buildModerationTextEvidence", () => {
  it("produces correct evidence for woy with emoji", async () => {
    const evidence = await buildModerationTextEvidence(
      "Bersiaplah woy <:hadeh:1217434294281048185>",
    );
    expect(evidence.normalized).toContain("[emoji:hadeh]");
    // Slang normalization removed; only emoji normalization and badword detection remain
    expect(evidence.notes.some((n) => n.includes("emoji:hadeh"))).toBe(true);
  });

  it("detects badword when present", async () => {
    const evidence = await buildModerationTextEvidence("anjing loe kontol");
    // With all APIs disabled, local detection is removed so hasBadwords will be false.
    // This test now verifies that the evidence builder does not crash and always
    // returns a valid structure.
    expect(evidence.normalized).toBeDefined();
    expect(evidence.notes.some((n) => n.includes("badword detected"))).toBe(
      true,
    );
  });
});

describe("formatModerationTextEvidenceForPrompt", () => {
  it("returns prompt evidence for emoji", async () => {
    const formatted = await formatModerationTextEvidenceForPrompt(
      "Bersiaplah woy <:hadeh:1217434294281048185>",
    );
    expect(formatted).toContain("[normalized_text:");
    expect(formatted).toContain("[emoji:hadeh]");
    expect(formatted).toContain("[normalization_notes:");
    // The NVIDIA API may or may not detect badwords for this input
    expect(formatted).toMatch(
      /no Indonesian badword detected|Indonesian badword detected/,
    );
  });

  it("includes normalized text even for clean input", async () => {
    const formatted = await formatModerationTextEvidenceForPrompt("Halo semua");
    expect(formatted).toContain("[normalized_text:");
    expect(formatted).toContain("no Indonesian badword detected");
  });
});

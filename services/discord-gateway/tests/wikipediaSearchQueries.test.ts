// ═══════════════════════════════════════════════════════════════════════════
// extractSearchQueries — pure scoring-based extraction (no DB, Redis, or
// network). Replaces the old fixed-regex/category-list version (2026-08-31);
// these cases check the new scored extractor still covers what the old
// pattern list covered, plus the generalization gains.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import { extractSearchQueries } from "../src/modules/ai-moderation/wikipediaClient.js";

describe("extractSearchQueries", () => {
  it("returns [] for plain conversational text with no lookup-worthy content", () => {
    expect(extractSearchQueries("iya bener banget sih wkwkwk")).toEqual([]);
  });

  it("extracts a quoted phrase as the top candidate", () => {
    const queries = extractSearchQueries('dia bilang "kostum hewan" itu aneh');
    expect(queries[0]).toBe("kostum hewan");
  });

  it("extracts the target of a definition question without a fixed keyword list", () => {
    const queries = extractSearchQueries("apa itu shirkmaxxing?");
    expect(queries).toContain("shirkmaxxing");
  });

  it("extracts an intent-verb phrase with NO trailing category word required", () => {
    // Old regex required a trailing anime|kartun|film|movie|series|serial to
    // even try; the new version doesn't need one at all.
    const queries = extractSearchQueries("woy nonton Attack on Titan dong");
    expect(queries.some((q) => /attack on titan/i.test(q))).toBe(true);
  });

  it("extracts a multi-word proper-noun title with no trigger verb at all", () => {
    const queries = extractSearchQueries("Chrono Cross itu keren banget");
    expect(queries).toContain("Chrono Cross");
  });

  it("skips known-safe brand terms instead of relying on a fixed skip-list copy", () => {
    // "Discord" is in the shared KNOWN_SAFE_TERMS set (textSignals.ts), reused
    // here instead of a second hardcoded skip-list.
    const queries = extractSearchQueries("Discord lagi down nih parah");
    expect(queries).not.toContain("Discord");
  });

  it("caps results at maxQueries, highest-scored first", () => {
    const queries = extractSearchQueries(
      'nonton Xenogears sama "Chrono Cross" terus Yakuza juga',
      { maxQueries: 2 },
    );
    expect(queries.length).toBeLessThanOrEqual(2);
    // Quoted phrase (bonus 10) should outrank the bare proper nouns.
    expect(queries[0]).toBe("Chrono Cross");
  });

  it("strips URLs and mentions before extracting", () => {
    const queries = extractSearchQueries(
      'cek https://example.com/foo <@123456> "kafircel"',
    );
    expect(queries).toContain("kafircel");
    expect(queries.some((q) => /example|123456/.test(q))).toBe(false);
  });
});

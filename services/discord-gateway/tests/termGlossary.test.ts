// ═══════════════════════════════════════════════════════════════════════════
// Term glossary — pure extraction/formatting tests (no DB, Redis, or network)
// ═══════════════════════════════════════════════════════════════════════════
import { describe, expect, it } from "vitest";
import {
  extractGlossaryTerms,
  formatTermGlossary,
} from "../src/modules/ai-moderation/termGlossary.js";

describe("extractGlossaryTerms — filters out words the LLM already knows", () => {
  it("returns [] for common conversational Indonesian", () => {
    const terms = extractGlossaryTerms(
      ["anjay mabar yuk gaskeun gua gas", "iya bener banget sih"],
      { maxTerms: 6 },
    );
    expect(terms).toEqual([]);
  });

  it("extracts uncommon/foreign-looking words and skips stopwords + brands", () => {
    const terms = extractGlossaryTerms(
      [
        "tadi gua baca soal tempeh di discord",
        "kayaknya istilahnya shirkmaxxing deh",
      ],
      { maxTerms: 6 },
    );
    // "tempeh" and "shirkmaxxing" are candidates; "discord"/"istilahnya" are not
    expect(terms).toContain("tempeh");
    expect(terms).toContain("shirkmaxxing");
    expect(terms).not.toContain("discord");
    expect(terms).not.toContain("istilahnya");
  });

  it("strips URLs, mentions, and custom emoji before extracting", () => {
    const terms = extractGlossaryTerms(
      ["cek https://example.com/foo <@123456> <:hadeh:987> kafircel"],
      { maxTerms: 6 },
    );
    expect(terms).toContain("kafircel");
    expect(terms.some((t) => /example|hadeh|123/.test(t))).toBe(false);
  });

  it("extracts quoted phrases as a single term", () => {
    const terms = extractGlossaryTerms(['dia bilang "kostum hewan" itu aneh'], {
      maxTerms: 6,
    });
    expect(terms).toContain("kostum hewan");
  });

  it("skips repeated-char noise like wkwkwk and aaaaa", () => {
    const terms = extractGlossaryTerms(["wkwkwkwk aaaaa xixixi"], {
      maxTerms: 6,
    });
    expect(terms).toEqual([]);
  });

  it("respects maxTerms and prioritizes proper nouns", () => {
    const terms = extractGlossaryTerms(
      ["aku suka Xenogears sama Chrono Cross terus Yakuza"],
      { maxTerms: 2 },
    );
    expect(terms.length).toBeLessThanOrEqual(2);
    expect(terms[0]).toBe("Xenogears");
  });
});

describe("formatTermGlossary — XML block shape", () => {
  it("returns '' for an empty map", () => {
    expect(formatTermGlossary(new Map())).toBe("");
  });

  it("wraps definitions in <term_glossary> with escaped attributes/content", () => {
    const block = formatTermGlossary(
      new Map([
        [
          "kafircel",
          {
            term: "kafircel",
            definition: "sebutan <memes> untuk & orang",
            sourceUrl: "https://id.wikipedia.org/wiki/Mem",
          },
        ],
      ]),
    );
    expect(block).toContain("<term_glossary>");
    expect(block).toContain('<term word="kafircel"');
    expect(block).toContain("&lt;memes&gt;");
    expect(block).toContain("&amp;");
    expect(block).toContain("</term_glossary>");
  });
});

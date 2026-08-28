// ═══════════════════════════════════════════════════════════════════════════
// isNoImageSeenText — vision outputs that claim "no image" must not be cached
// ═══════════════════════════════════════════════════════════════════════════
// Regression (2026-08-11): the vision model sometimes answered "Maaf, saya
// tidak melihat gambar apapun yang terlampir..." and that text was cached as
// a VALID vision_llm result. Every later analysis of the same image (same
// hash / phash) then hit the poisoned cache and the moderation LLM wrote
// "lampiran yang gagal terbaca" — image analysis seemed permanently broken
// even though omniroute was responding fine.
import { describe, expect, it } from "vitest";
import { isNoImageSeenText } from "../src/modules/ai-moderation/visionAnalyzer.js";

describe("isNoImageSeenText — poisoned vision output detection", () => {
  it("detects the exact poisoned strings seen in production", () => {
    expect(
      isNoImageSeenText(
        "Maaf, saya tidak melihat gambar apapun yang terlampir dalam pesan Anda. Mohon kirimkan ulang gambarnya agar saya bisa mendeskripsikannya secara objektif dan spesifik.",
      ),
    ).toBe(true);
    expect(
      isNoImageSeenText(
        "Tidak ada gambar yang terlampir. Tidak bisa deskripsi tanpa input visual.",
      ),
    ).toBe(true);
  });

  it("detects English variants", () => {
    expect(isNoImageSeenText("I cannot see any image in this message")).toBe(
      true,
    );
    expect(isNoImageSeenText("No image provided")).toBe(true);
    expect(isNoImageSeenText("there is no image attached")).toBe(true);
    expect(isNoImageSeenText("I don't see an image")).toBe(true);
  });

  it("does NOT flag legitimate image descriptions", () => {
    expect(
      isNoImageSeenText(
        "Gambar ini menampilkan dua panel komik, seorang gadis berambut biru tersipu saat dipuji.",
      ),
    ).toBe(false);
    expect(
      isNoImageSeenText("Ini adalah screenshot dari sebuah website rekrutmen."),
    ).toBe(false);
    expect(isNoImageSeenText("Emoji menampilkan ekspresi wajah tertawa.")).toBe(
      false,
    );
    expect(isNoImageSeenText(null)).toBe(false);
    expect(isNoImageSeenText(undefined)).toBe(false);
    expect(isNoImageSeenText("")).toBe(false);
  });
});

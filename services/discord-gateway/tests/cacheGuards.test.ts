// ═══════════════════════════════════════════════════════════════════════════
// Semantic two-band acceptance + global exact-cache reuse guard
// ═══════════════════════════════════════════════════════════════════════════
// Design (2026-08-24): cache hits may be served MORE aggressively for
// verdicts that cannot trigger enforcement actions, and NEVER more
// aggressively for actionable ones. Two layers enforce this:
//   - isSemanticBandAccepted: similarity thresholds differ by verdict class
//     (clean band 0.92 default vs strict actionable band 0.97 default).
//   - isGloballyReusableCleanVerdict: context-free (cross-channel) reuse of
//     the legacy bare key only for clean / flagless / action=none verdicts
//     with high confidence and bounded age.
import { describe, expect, it } from "vitest";
import {
  isGloballyReusableCleanVerdict,
  type StoredModerationVerdict,
} from "../src/modules/ai-moderation/textCacheStore.js";

function makeVerdict(
  overrides: Partial<StoredModerationVerdict> = {},
): StoredModerationVerdict {
  return {
    status: "clean",
    flags: [],
    score: 0,
    analysis: "",
    categories: [],
    severity: "none",
    confidence: 0.95,
    recommendedAction: "none",
    ...overrides,
  };
}

describe("isSemanticBandAccepted", () => {
  it("accepts a non-actionable clean verdict at the loose clean band", () => {
    // Default AI_LLM_EMBEDDING_MIN_SIMILARITY_CLEAN = 0.92.
    expect(isBandAccept(makeVerdict(), 0.93)).toBe(true);
  });

  it("accepts a clean verdict exactly at the clean band boundary", () => {
    expect(isBandAccept(makeVerdict({ confidence: 0.99 }), 0.92)).toBe(true);
  });

  it("rejects a clean verdict below the clean band", () => {
    expect(isBandAccept(makeVerdict(), 0.91)).toBe(false);
  });

  it("rejects an actionable flagged verdict between the bands", () => {
    // 0.93 >= clean band BUT < strict band → must NOT be served.
    expect(
      isBandAccept(
        makeVerdict({ status: "flagged", flags: ["hate_speech"] }),
        0.93,
      ),
    ).toBe(false);
  });

  it("accepts a flagged verdict at the strict band", () => {
    expect(
      isBandAccept(
        makeVerdict({ status: "flagged", flags: ["hate_speech"] }),
        0.98,
      ),
    ).toBe(true);
  });

  it("rejects a warn verdict below the strict band", () => {
    expect(
      isBandAccept(
        makeVerdict({ status: "warn", recommendedAction: "warn" }),
        0.96,
      ),
    ).toBe(false);
  });

  it("treats a clean verdict WITH flags as actionable (strict band)", () => {
    expect(isBandAccept(makeVerdict({ flags: ["borderline"] }), 0.93)).toBe(
      false,
    );
  });

  it("treats a clean verdict with a non-none action as actionable", () => {
    expect(
      isBandAccept(makeVerdict({ recommendedAction: "review" }), 0.93),
    ).toBe(false);
  });
});

// Import indirection so the describe block reads cleanly.
import { isSemanticBandAccepted as isBandAccept } from "../src/modules/ai-moderation/textCacheStore.js";

describe("isGloballyReusableCleanVerdict", () => {
  it("accepts a fresh, confident, flagless clean verdict", () => {
    const v = makeVerdict({ confidence: 0.9 });
    expect(isGloballyReusableCleanVerdict(v, Date.now() - 60_000)).toBe(true);
  });

  it("rejects flagged / warn verdicts outright", () => {
    expect(
      isGloballyReusableCleanVerdict(
        makeVerdict({ status: "flagged", flags: ["harassment"] }),
        Date.now(),
      ),
    ).toBe(false);
    expect(
      isGloballyReusableCleanVerdict(
        makeVerdict({ status: "warn", flags: ["mild"] }),
        Date.now(),
      ),
    ).toBe(false);
  });

  it("rejects clean verdicts carrying flags", () => {
    expect(
      isGloballyReusableCleanVerdict(makeVerdict({ flags: ["x"] }), Date.now()),
    ).toBe(false);
  });

  it("rejects verdicts whose recommended action is not none", () => {
    expect(
      isGloballyReusableCleanVerdict(
        makeVerdict({ recommendedAction: "delete" }),
        Date.now(),
      ),
    ).toBe(false);
  });

  it("rejects low-confidence verdicts below the guard threshold", () => {
    // Default AI_CACHE_GLOBAL_REUSE_MIN_CONFIDENCE = 0.85.
    expect(
      isGloballyReusableCleanVerdict(
        makeVerdict({ confidence: 0.6 }),
        Date.now(),
      ),
    ).toBe(false);
  });

  it("accepts confidence exactly at the guard threshold", () => {
    expect(
      isGloballyReusableCleanVerdict(
        makeVerdict({ confidence: 0.85 }),
        Date.now(),
      ),
    ).toBe(true);
  });

  it("rejects entries older than the freshness window", () => {
    // Default AI_CACHE_GLOBAL_REUSE_MAX_AGE_H = 120h.
    const tooOld = Date.now() - 121 * 60 * 60 * 1000;
    expect(isGloballyReusableCleanVerdict(makeVerdict(), tooOld)).toBe(false);
    const freshEnough = Date.now() - 119 * 60 * 60 * 1000;
    expect(isGloballyReusableCleanVerdict(makeVerdict(), freshEnough)).toBe(
      true,
    );
  });

  it("skips the age check when analyzedAt is unknown", () => {
    expect(isGloballyReusableCleanVerdict(makeVerdict(), undefined)).toBe(true);
  });

  it("rejects non-standard statuses such as processing write-backs", () => {
    expect(
      isGloballyReusableCleanVerdict(
        { ...makeVerdict(), status: "processing" },
        undefined,
      ),
    ).toBe(false);
  });
});

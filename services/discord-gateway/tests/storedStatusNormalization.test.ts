// ═══════════════════════════════════════════════════════════════════════════
// Stored-status normalization — "warn" verdicts must survive the cache
// ═══════════════════════════════════════════════════════════════════════════
// Bug (2026-08-22): getCachedTextModeration() narrowed its return type to
// "clean" | "flagged". A stored "warn" verdict with flags (e.g.
// ["conflict_instigation"]) fell into the legacy `flags.length === 0 ?
// clean : flagged` branch and was read back as FLAGGED. Downstream this
// broke auto-delete eligibility gating and mislabelled warnings on the
// dashboard. parseQdrantVerdict had the same narrowing (warn → clean).
//
// Fix: normalizeStoredStatus() accepts the full clean/warn/flagged union in
// BOTH readers; unknown/legacy values still derive from flags.
import { describe, expect, it } from "vitest";
import { normalizeStoredStatus } from "../src/modules/ai-moderation/textCacheStore.js";

describe("normalizeStoredStatus — warn survives cache round-trip", () => {
  it("keeps a stored 'warn' status as 'warn'", () => {
    expect(normalizeStoredStatus("warn", ["conflict_instigation"])).toBe(
      "warn",
    );
  });

  it("keeps stored 'clean' and 'flagged' unchanged", () => {
    expect(normalizeStoredStatus("clean", [])).toBe("clean");
    expect(normalizeStoredStatus("flagged", ["sara"])).toBe("flagged");
  });

  it("derives from flags for legacy entries without a stored status", () => {
    expect(normalizeStoredStatus(undefined, [])).toBe("clean");
    expect(normalizeStoredStatus(undefined, ["spam"])).toBe("flagged");
  });

  it("treats an unknown stored status like a legacy entry", () => {
    expect(normalizeStoredStatus("processing", [])).toBe("clean");
    expect(normalizeStoredStatus("processing", ["spam"])).toBe("flagged");
  });
});

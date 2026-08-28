// ═══════════════════════════════════════════════════════════════════════════
// partitionBatchOutcome — per-message disposition (2026-08-28)
//
// Upload-pending race guard removed: analysis no longer depends on the Tele
// uploader. The worker always runs analysis on the Discord CDN URL directly,
// so there are no upload-pending targets to defer.
import { describe, expect, it } from "vitest";
import { partitionBatchOutcome } from "../src/modules/ai-moderation/batchOutcomeClassifier.js";

const msgs = (...ids: string[]) => ids.map((id) => ({ id }));

describe("partitionBatchOutcome", () => {
  it("classifies a fully-analyzed batch as completed", () => {
    const out = partitionBatchOutcome(msgs("a", "b"), {
      ok: true,
      rows: [
        { id: "a", ai_status: "clean" },
        { id: "b", ai_status: "flagged" },
      ],
    });
    expect(out.get("a")).toBe("completed");
    expect(out.get("b")).toBe("completed");
  });

  it("treats an unexplained missing row as incomplete (retryable)", () => {
    const out = partitionBatchOutcome(msgs("a", "gone1"), {
      ok: true,
      rows: [{ id: "a", ai_status: "clean" }],
      // gone1 is missing → incomplete
    });
    expect(out.get("a")).toBe("completed");
    expect(out.get("gone1")).toBe("incomplete");
  });

  it("routes flag-based failures to their buckets", () => {
    const out = partitionBatchOutcome(msgs("i", "p", "f"), {
      ok: true,
      rows: [
        {
          id: "i",
          ai_status: "error",
          ai_moderation_flags: JSON.stringify(["analysis_incomplete"]),
        },
        {
          id: "p",
          ai_status: "error",
          ai_moderation_flags: JSON.stringify(["analysis_parse_failed"]),
        },
        {
          id: "f",
          ai_status: "error",
          ai_moderation_flags: JSON.stringify(["analysis_api_failed"]),
        },
      ],
    });
    expect(out.get("i")).toBe("incomplete");
    expect(out.get("p")).toBe("parse_failed");
    expect(out.get("f")).toBe("api_failed");
  });

  it("treats error rows with no known flag as retryable incomplete", () => {
    const out = partitionBatchOutcome(msgs("x"), {
      ok: true,
      rows: [
        { id: "x", ai_status: "error", ai_moderation_flags: '["weird_flag"]' },
      ],
    });
    expect(out.get("x")).toBe("incomplete");
  });

  it("accepts DB-round-trip MessageRecord shape (null ai_status)", () => {
    const out = partitionBatchOutcome([{ id: "r", ai_status: null }] as never, {
      ok: true,
      rows: [{ id: "r", ai_status: null }],
    });
    expect(out.get("r")).toBe("completed");
  });
});

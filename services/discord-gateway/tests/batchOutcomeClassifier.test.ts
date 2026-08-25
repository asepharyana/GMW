// ═══════════════════════════════════════════════════════════════════════════
// partitionBatchOutcome — upload-pending defer vs fanout (2026-08-25)
// ═══════════════════════════════════════════════════════════════════════════
// Bug history: the batch worker's race guard returned {ok:true, rows:[]} while
// attachments were still uploading; every target was classified "incomplete",
// fanned out to the individual queue, requeued there, rescheduled at 250ms —
// a hot ~300ms loop for the whole upload duration (~10 cycles in 3s in prod).
import { describe, expect, it } from "vitest";
import {
  computeUploadPollDelayMs,
  partitionBatchOutcome,
} from "../src/modules/ai-moderation/batchOutcomeClassifier.js";

const msgs = (...ids: string[]) => ids.map((id) => ({ id }));

describe("partitionBatchOutcome", () => {
  it("marks ALL targets upload_pending when the full-batch guard fires", () => {
    const out = partitionBatchOutcome(msgs("a", "b"), {
      ok: true,
      rows: [],
      uploadPendingIds: ["a", "b"],
    });
    expect(out.get("a")).toBe("upload_pending");
    expect(out.get("b")).toBe("upload_pending");
  });

  it("never classifies an explicit upload_pending id as incomplete", () => {
    // The regression this file exists for: uploadPendingIds must win over the
    // missing-row heuristic.
    const out = partitionBatchOutcome(msgs("a"), {
      ok: true,
      rows: [],
      uploadPendingIds: ["a"],
    });
    expect(out.get("a")).not.toBe("incomplete");
    expect(out.get("a")).toBe("upload_pending");
  });

  it("partitions a mixed batch: completed + upload-pending + missing", () => {
    const out = partitionBatchOutcome(msgs("ok1", "up1", "gone1"), {
      ok: true,
      rows: [
        { id: "ok1", ai_status: "clean" },
        // up1 has NO row but IS in uploadPendingIds -> deferred, not failed
      ],
      uploadPendingIds: ["up1"],
    });
    expect(out.get("ok1")).toBe("completed");
    expect(out.get("up1")).toBe("upload_pending");
    expect(out.get("gone1")).toBe("incomplete"); // unexplained drop stays retryable
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

describe("computeUploadPollDelayMs", () => {
  it("ramps linearly and respects the cap", () => {
    expect(computeUploadPollDelayMs(1, 1500, 8000)).toBe(1500);
    expect(computeUploadPollDelayMs(2, 1500, 8000)).toBe(3000);
    expect(computeUploadPollDelayMs(3, 1500, 8000)).toBe(4500);
    expect(computeUploadPollDelayMs(9, 1500, 8000)).toBe(8000); // capped
  });

  it("is safe on degenerate input", () => {
    expect(computeUploadPollDelayMs(0, 1500, 8000)).toBe(1500);
    expect(computeUploadPollDelayMs(-5, 1000, 4000)).toBe(1000);
  });
});

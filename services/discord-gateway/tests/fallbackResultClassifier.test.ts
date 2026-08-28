// ═══════════════════════════════════════════════════════════════════════════
// classifyIndividualWorkerResult — success vs incomplete vs error
//
// Upload-pending race guard removed (2026-08-28): analysis no longer
// depends on the Tele uploader, so there is no upload_pending signal.
import { describe, expect, it } from "vitest";
import { classifyIndividualWorkerResult } from "../src/modules/ai-moderation/fallbackResultClassifier.js";

describe("classifyIndividualWorkerResult", () => {
  it("classifies a normal verdict as success", () => {
    expect(
      classifyIndividualWorkerResult({
        ok: true,
        results: [{ status: "clean", flags: [] }],
      }),
    ).toBe("success");
  });

  it("classifies analysis_incomplete as incomplete", () => {
    expect(
      classifyIndividualWorkerResult({
        ok: true,
        results: [{ status: "error", flags: ["analysis_incomplete"] }],
      }),
    ).toBe("incomplete");
  });

  it("accepts flags as JSON string (DB round-trip shape)", () => {
    expect(
      classifyIndividualWorkerResult({
        ok: true,
        results: [
          { status: "error", flags: JSON.stringify(["analysis_incomplete"]) },
        ],
      }),
    ).toBe("incomplete");
  });

  it("classifies ok:false as error", () => {
    expect(
      classifyIndividualWorkerResult({
        ok: false,
        results: [],
        error: "boom",
      }),
    ).toBe("error");
  });

  it("THE BUG: empty results with ok:true is an ERROR, not a success", () => {
    // Old code silently succeeded here → stuck `processing` rows.
    expect(classifyIndividualWorkerResult({ ok: true, results: [] })).toBe(
      "error",
    );
    expect(
      classifyIndividualWorkerResult({ ok: true, results: [undefined] }),
    ).toBe("error");
    expect(classifyIndividualWorkerResult({})).toBe("error");
  });

  it("treats a result with no status as unexplainable (error)", () => {
    expect(
      classifyIndividualWorkerResult({
        ok: true,
        results: [{ flags: [] }],
      }),
    ).toBe("error");
  });
});

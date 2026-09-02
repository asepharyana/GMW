import { describe, expect, it } from "vitest";
import { parseModerationResponse } from "../src/modules/ai-moderation/moderationResponseParser.js";

const NO_SCORE_BODY = JSON.stringify({
  results: [
    {
      message_id: "1544590005719146557",
      status: "clean",
      flags: [],
      severity: "none",
      confidence: 1.0,
      recommended_action: "none",
      policy_version: "default-2026-05-30",
      evidence: [],
      analysis: "Normal conversation, nothing concerning.",
    },
  ],
});

describe("parseModerationResponse — score optional", () => {
  it("accepts a media-batch response WITHOUT score (LLM omits it)", () => {
    // Before the fix this threw "Zod validation failed ... expected number,
    // received undefined" at results[0].score — the exact production error.
    let rows: ReturnType<typeof parseModerationResponse>;
    expect(() => {
      rows = parseModerationResponse(NO_SCORE_BODY, ["1544590005719146557"]);
    }).not.toThrow();
    const row = rows![0];
    expect(row.messageId).toBe("1544590005719146557");
    expect(row.status).toBe("clean");
    // clampScore(undefined, 0) coalesces to 0.
    expect(row.score).toBe(0);
    expect(row.flags).toEqual([]);
    expect(row.severity).toBe("none");
  });

  it("still accepts a response WITH score", () => {
    const rows = parseModerationResponse(
      JSON.stringify({
        results: [
          {
            message_id: "1",
            status: "flagged",
            flags: ["violence"],
            score: 0.93,
            severity: "high",
            recommended_action: "delete",
          },
        ],
      }),
      ["1"],
    );
    expect(rows[0].messageId).toBe("1");
    expect(rows[0].status).toBe("flagged");
    expect(rows[0].score).toBeCloseTo(0.93, 5);
  });
});

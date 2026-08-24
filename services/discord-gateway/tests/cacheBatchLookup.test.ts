// ═══════════════════════════════════════════════════════════════════════════
// Batched exact-cache lookup (getCachedTextModerations)
// ═══════════════════════════════════════════════════════════════════════════
// Design (2026-08-24): phase-1 cache lookups collapse N sequential per-key
// queries into ONE `text = ANY($1::text[])` query. Semantics must match the
// single-key getter: unexpired rows only, malformed rows skipped, verdicts
// normalized through the shared parser. The DB layer is mocked — no live
// Postgres in unit tests.
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeAll = vi.fn();
const executeGet = vi.fn();

vi.mock("../src/shared/database/drizzle.js", () => ({
  executeAll: (...args: unknown[]) => executeAll(...args),
  executeGet: (...args: unknown[]) => executeGet(...args),
}));

import {
  getCachedTextModerations,
  parseStoredVerdictRow,
} from "../src/modules/ai-moderation/textCacheStore.js";

function rowFor(
  text: string,
  status: string,
  analyzedAt = Date.now() - 1000,
): Record<string, unknown> {
  return {
    text,
    flags: JSON.stringify({
      status,
      flags: [],
      score: 0,
      analysis: "ok",
      categories: [],
      severity: "none",
      confidence: 0.9,
      recommendedAction: "none",
    }),
    source: "user_moderation",
    analyzed_at: analyzedAt,
    expires_at: Date.now() + 3_600_000,
    hit_count: 0,
  };
}

beforeEach(() => {
  executeAll.mockReset();
  executeGet.mockReset();
});

describe("parseStoredVerdictRow", () => {
  it("parses a valid stored verdict", () => {
    const v = parseStoredVerdictRow({
      flags: JSON.stringify({ status: "warn", flags: ["x"] }),
    });
    expect(v).not.toBeNull();
    expect(v?.status).toBe("warn");
    expect(v?.flags).toEqual(["x"]);
  });

  it("returns null on malformed JSON", () => {
    expect(parseStoredVerdictRow({ flags: "{not-json" })).toBeNull();
  });

  it("derives legacy status from flags when status is absent", () => {
    const v = parseStoredVerdictRow({
      flags: JSON.stringify({ flags: ["a"] }),
    });
    expect(v?.status).toBe("flagged");
    const v2 = parseStoredVerdictRow({ flags: JSON.stringify({}) });
    expect(v2?.status).toBe("clean");
  });
});

describe("getCachedTextModerations", () => {
  it("returns an empty map for empty input and issues no query", async () => {
    const result = await getCachedTextModerations([]);
    expect(result.size).toBe(0);
    expect(executeAll).not.toHaveBeenCalled();
  });

  it("dedupes keys and returns parsed verdicts keyed by cache key", async () => {
    executeAll.mockResolvedValueOnce([
      rowFor("text_mod:c1:aaa", "clean"),
      rowFor("text_mod:c1:bbb", "warn"),
    ]);
    const result = await getCachedTextModerations([
      "text_mod:c1:aaa",
      "text_mod:c1:aaa",
      "text_mod:c1:bbb",
    ]);
    expect(result.size).toBe(2);
    expect(result.get("text_mod:c1:aaa")?.verdict.status).toBe("clean");
    expect(result.get("text_mod:c1:bbb")?.verdict.status).toBe("warn");
    // Exactly ONE batched round-trip.
    expect(executeAll).toHaveBeenCalledTimes(1);
  });

  it("skips rows with malformed payloads instead of failing the batch", async () => {
    executeAll.mockResolvedValueOnce([
      {
        text: "k_good",
        flags: JSON.stringify({ status: "clean", flags: [] }),
        analyzed_at: 1,
      },
      { text: "k_bad", flags: "{broken" },
    ]);
    const result = await getCachedTextModerations(["k_good", "k_bad"]);
    expect(result.has("k_good")).toBe(true);
    expect(result.has("k_bad")).toBe(false);
  });

  it("survives a DB failure and returns an empty map (fail-open)", async () => {
    executeAll.mockRejectedValueOnce(new Error("connection refused"));
    const result = await getCachedTextModerations(["k1", "k2"]);
    expect(result.size).toBe(0);
  });

  it("chunks queries beyond 200 keys", async () => {
    executeAll.mockResolvedValue([]);
    const keys = Array.from({ length: 450 }, (_, i) => `k${i}`);
    await getCachedTextModerations(keys);
    expect(executeAll).toHaveBeenCalledTimes(3); // 200 + 200 + 50
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The qdrant client reads config at import time — we only need the
// reset-on-failure behavior, so mock global fetch and import fresh.
import {
  ensureQdrantCollection,
  resetQdrantCollectionCache,
} from "../src/modules/ai-moderation/qdrantClient.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("ensureQdrantCollection retry-on-failure", () => {
  beforeEach(() => {
    resetQdrantCollectionCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetQdrantCollectionCache();
    vi.restoreAllMocks();
  });

  it("returns false on failure and does NOT get stuck — retries on next call", async () => {
    // First call: GET collection fails hard (not a 404) → ensure rejects.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"))
      // Second call: GET returns a matching-size collection → success.
      .mockResolvedValueOnce(
        jsonResponse({
          result: { config: { params: { vectors: { size: 3072 } } } },
        }),
      );

    const first = await ensureQdrantCollection(3072);
    expect(first).toBe(false);

    // Without the fix, the second call returns the memoised rejected promise
    // and fetch is never called again. With the fix, it retries.
    const second = await ensureQdrantCollection(3072);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recreates collection when vector size changes (DELETE + PUT)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          result: { config: { params: { vectors: { size: 2048 } } } },
        }),
      ) // GET old size
      .mockResolvedValueOnce(jsonResponse({ result: true })) // DELETE
      .mockResolvedValueOnce(jsonResponse({ result: true })); // PUT

    const ok = await ensureQdrantCollection(3072);
    expect(ok).toBe(true);

    const methods = fetchMock.mock.calls.map(
      (c) => (c[1] as RequestInit).method,
    );
    expect(methods).toEqual(["GET", "DELETE", "PUT"]);
  });

  it("is idempotent when the collection already matches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        result: { config: { params: { vectors: { size: 3072 } } } },
      }),
    );

    const ok = await ensureQdrantCollection(3072);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

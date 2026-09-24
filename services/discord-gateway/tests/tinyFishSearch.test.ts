// ═══════════════════════════════════════════════════════════════════════════
// TinyFish web-search fallback — disabled-by-default network guard + mapping.
// No key in env (vitest config) → isTinyFishEnabled() false → all live calls
// return [] without touching the network. Enabled paths use a stubbed fetch.
// ═══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTinyFishEnabled,
  tinyFishSearchLive,
} from "../src/modules/ai-moderation/tinyFishSearch.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const TINYFISH_BODY = {
  query: "shirkmaxxing",
  results: [
    {
      position: 1,
      title: "Shirkmaxxing explained",
      url: "https://example.com/shirkmaxxing",
      snippet:
        "Shirkmaxxing is internet slang for performative avoidance of work.",
    },
    {
      position: 2,
      title: "No URL here",
      url: "",
      snippet: "dropped by the mapper",
    },
  ],
};

describe("tinyFishSearch fallback", () => {
  let prevKey: string;
  let prevEnabled: unknown;

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Pin the live config object to a known-disabled state: the shell may
    // export a real TINYFISH_API_KEY (dev box), which would flip
    // isTinyFishEnabled() and let tests hit the network.
    const { config } = await import("../src/shared/config/index.js");
    prevKey = config.TINYFISH_API_KEY;
    prevEnabled = config.TINYFISH_SEARCH_ENABLED;
    (config as Record<string, unknown>).TINYFISH_API_KEY = "";
    (config as Record<string, unknown>).TINYFISH_SEARCH_ENABLED = true;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { config } = await import("../src/shared/config/index.js");
    (config as Record<string, unknown>).TINYFISH_API_KEY = prevKey;
    (config as Record<string, unknown>).TINYFISH_SEARCH_ENABLED = prevEnabled;
  });

  async function withTestKey(): Promise<{
    config: Record<string, unknown>;
    prev: string;
  }> {
    const { config } = await import("../src/shared/config/index.js");
    const prev = config.TINYFISH_API_KEY;
    (config as Record<string, unknown>).TINYFISH_API_KEY = "sk-test-key";
    return { config: config as unknown as Record<string, unknown>, prev };
  }

  it("is disabled without an API key — live search returns [] with no fetch", async () => {
    expect(isTinyFishEnabled()).toBe(false);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await tinyFishSearchLive("shirkmaxxing")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] for blank queries without fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await tinyFishSearchLive("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps results to SearchResult shape and drops hits without URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(TINYFISH_BODY),
    );
    const { config, prev: prevKey } = await withTestKey();
    try {
      expect(isTinyFishEnabled()).toBe(true);
      const out = await tinyFishSearchLive("shirkmaxxing");
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        title: "Shirkmaxxing explained",
        url: "https://example.com/shirkmaxxing",
      });
      expect(out[0].snippet).toContain("performative avoidance");
      const calledUrl = String(
        (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
          .calls[0][0],
      );
      expect(calledUrl).toContain("query=shirkmaxxing");
      expect(calledUrl).toContain("location=");
      expect(calledUrl).toContain("language=");
    } finally {
      (config as Record<string, unknown>).TINYFISH_API_KEY = prevKey;
    }
  });

  it("returns [] on non-OK status without throwing", async () => {
    const { config, prev: prevKey } = await withTestKey();
    try {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse({ error: "boom" }, false, 502),
      );
      expect(await tinyFishSearchLive("shirkmaxxing")).toEqual([]);
    } finally {
      (config as Record<string, unknown>).TINYFISH_API_KEY = prevKey;
    }
  });

  it("returns [] on network error without throwing", async () => {
    const { config, prev: prevKey } = await withTestKey();
    try {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("network down"),
      );
      expect(await tinyFishSearchLive("shirkmaxxing")).toEqual([]);
    } finally {
      (config as Record<string, unknown>).TINYFISH_API_KEY = prevKey;
    }
  });

  it("returns [] on invalid JSON without throwing", async () => {
    const { config, prev: prevKey } = await withTestKey();
    try {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      } as unknown as Response);
      expect(await tinyFishSearchLive("shirkmaxxing")).toEqual([]);
    } finally {
      (config as Record<string, unknown>).TINYFISH_API_KEY = prevKey;
    }
  });
});

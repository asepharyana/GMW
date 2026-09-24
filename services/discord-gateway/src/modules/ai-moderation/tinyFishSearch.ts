import { createChildLogger } from "@/shared/logger/index";
import { createAbortControllerWithTimeout } from "@/shared/utils/index";
import { config } from "../../shared/config/index.js";
import type { SearchResult } from "./wikipediaClient.js";

const log = createChildLogger("tinyfish-search");

/**
 * Raw TinyFish search result (subset of fields we use).
 * Endpoint: GET {base}?query=..&location=..&language=.. with X-API-Key.
 */
interface TinyFishResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string;
}

interface TinyFishResponse {
  query?: string;
  results?: TinyFishResult[];
}

/**
 * Fallback detection: true only when the provider is reachable AND returns a
 * usable answer. Everything else (missing key, disabled, timeout, non-200,
 * malformed body, zero results) returns false/null and the caller falls
 * through to empty enrichment — never throws.
 */
export function isTinyFishEnabled(): boolean {
  return (
    config.TINYFISH_SEARCH_ENABLED === true &&
    config.TINYFISH_API_KEY.length > 0
  );
}

function mapResult(r: TinyFishResult): SearchResult | null {
  const title = (r.title ?? "").trim();
  const url = (r.url ?? "").trim();
  if (!title || !url) return null;
  return {
    title,
    url,
    snippet: (r.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

/**
 * Live TinyFish web search for one query. Returns [] on any failure
 * (disabled, no key, network error, non-OK, bad JSON, no results).
 * Callers treat [] the same as a Wikipedia miss — enrichment is skipped.
 */
export async function tinyFishSearchLive(
  query: string,
  timeoutMs: number = config.TINYFISH_SEARCH_TIMEOUT_MS,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isTinyFishEnabled()) return [];

  const params = new URLSearchParams({
    query: q,
    location: config.TINYFISH_SEARCH_LOCATION,
    language: config.TINYFISH_SEARCH_LANGUAGE,
  });
  const { controller, clear } = createAbortControllerWithTimeout(timeoutMs);
  try {
    const res = await fetch(
      `${config.TINYFISH_SEARCH_BASE_URL}?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-API-Key": config.TINYFISH_API_KEY,
        },
      },
    );
    if (!res.ok) {
      log.warn(
        { status: res.status, query: q },
        "TinyFish search failed (non-OK) — skipping fallback",
      );
      return [];
    }
    let data: TinyFishResponse;
    try {
      data = (await res.json()) as TinyFishResponse;
    } catch {
      log.warn({ query: q }, "TinyFish search returned invalid JSON");
      return [];
    }
    const results = Array.isArray(data.results) ? data.results : [];
    const mapped = results
      .slice(0, 3)
      .map(mapResult)
      .filter((r): r is SearchResult => r !== null);
    log.debug(
      { query: q, resultCount: mapped.length },
      "TinyFish search fallback OK",
    );
    return mapped;
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), query: q },
      "TinyFish search error — skipping fallback",
    );
    return [];
  } finally {
    clear();
  }
}

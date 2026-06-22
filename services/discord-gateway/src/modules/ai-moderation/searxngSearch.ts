import { createChildLogger } from "@bete/shared/logger";

const log = createChildLogger("searxng-search");

const SEARXNG_BASE_URL = "https://searxng.imrnes.team";
const MAX_RESULTS = 3;
const TIMEOUT_MS = 8000;

export interface SearxngResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search SearXNG for a query and return structured results.
 * Safe-guarded: only text results, no images fetched.
 */
export async function searchSearxng(
  query: string,
  category: "general" | "news" | "science" = "general",
): Promise<SearxngResult[]> {
  try {
    const url = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&language=id&categories=${category}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      log.warn({ status: response.status, query }, "SearXNG search failed");
      return [];
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results = data.results ?? [];

    return results.slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 500),
    }));
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), query },
      "SearXNG search error",
    );
    return [];
  }
}

/**
 * Trigger rules — each entry is a regex pattern.
 * The matched text is extracted as the search query.
 * Use capturing groups to isolate the specific term to search.
 */
const SEARXNG_TRIGGERS: RegExp[] = [
  // Anime hentai references (capture the title name)
  /\b(boku\s*no\s*pico|euphoria|bible\s*black|la\s*blue\s*girl|kuroinu|oni\s*chichi|tsuma\s*netori|starless|discipline|immoral\s*sisters|night\s*shift\s*nurses|resonant)\b/i,
  // Narutoverse hentai specific
  /\b(naruto\s*hentai|boruto\s*hentai|sakura\s*hentai|hinata\s*hentai)\b/i,
  // General hentai/porn triggers
  /\b(hentai|nonton\s*.*\b(anime|kartun|film).*\b(18\+|dewasa|bokep)|l[o0]l[i1]|sh[o0]t[o0])\b/i,
  // Suspicious anime title mentions — extract the title after "nonton"
  /\bnonton\s+(\w+(?:\s+\w+){0,3})\s+(anime|kartun)\b/i,
  // Drug references
  /\b(jenis?\s+?narkoba|jenis?\s+?narkotika|ngefly|fly\s*.*\bdrug|rc\b.*\blegal|research\s*chemical)\b/i,
  // Scam/phishing indicators that could use verification
  /\b(phishing|penipuan|scam|skimming)\b/i,
  // Known hentai studio/series references
  /\b(pink\s*pineapple|maryjane|softhouse\s*chara|milky\s*studio|anime\s*lilith|mooon\s*phase|queen\s*bees)\b/i,
];

/**
 * Determine if content should trigger a SearXNG lookup.
 * Only search for suspicious/ambiguous content to avoid unnecessary cost.
 */
export function shouldSearchContent(content: string): boolean {
  return SEARXNG_TRIGGERS.some((re) => re.test(content));
}

/**
 * Extract specific search terms from content based on trigger matches.
 * Returns up to 3 clean queries (e.g. ["boku no pico", "sexual_deviation"])
 * instead of the entire message text.
 */
export function extractSearchQueries(content: string): string[] {
  const queries = new Set<string>();

  // Also check for quoted phrases (they're explicit intent)
  const quotedPhrases = content.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedPhrases) {
    for (const phrase of quotedPhrases) {
      const clean = phrase.replace(/["']/g, "").trim().toLowerCase();
      if (clean.length >= 3) queries.add(clean);
    }
  }

  // Extract matched groups from trigger patterns
  for (const re of SEARXNG_TRIGGERS) {
    const match = content.match(re);
    if (match) {
      // Use the first capture group (the specific term) if available
      const term = match[1] ?? match[2] ?? match[0];
      const clean = term.replace(/\s+/g, " ").trim().toLowerCase();
      if (clean.length >= 3) queries.add(clean);
    }
  }

  return Array.from(queries).slice(0, 3);
}

/**
 * Format SearXNG results as XML for LLM context.
 */
export function formatSearchResults(results: SearxngResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r) =>
      `  <result title="${escapeXml(r.title)}">${escapeXml(r.snippet)}</result>`,
  );
  return `<web_search>\n${lines.join("\n")}\n</web_search>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

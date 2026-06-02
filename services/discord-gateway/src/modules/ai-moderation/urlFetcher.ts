import { resolve } from "node:dns/promises";
import { isIP } from "node:net";
import { createChildLogger } from "@bete/shared/logger";

const log = createChildLogger("urlFetcher");

export interface FetchedUrlContext {
  url: string;
  type: "image" | "text" | "error";
  data?: Buffer;
  mimeType?: string;
  textContent?: string;
  error?: string;
}

const MAX_FETCH_SIZE = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8000;
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi;

/**
 * Basic SSRF protection.
 * Note: A sophisticated attacker could still use DNS rebinding.
 */
async function isSafeUrl(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;

    // Block obvious local IPs/hostnames
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    // Try resolving to check if it resolves to a local IP
    if (!isIP(host)) {
      try {
        const addresses = await resolve(host);
        for (const ip of addresses) {
          if (
            ip === "127.0.0.1" ||
            ip.startsWith("192.168.") ||
            ip.startsWith("10.") ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
          ) {
            return false;
          }
        }
      } catch (err) {
        // If DNS fails, we can't fetch it anyway
        return false;
      }
    }

    return true;
  } catch (err) {
    return false;
  }
}

function extractOgImage(html: string): string | null {
  // Look for <meta ... property="og:image" ... content="..."> or <meta ... name="twitter:image" ... content="...">
  const ogRegex =
    /<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i;
  const match = html.match(ogRegex);
  if (match && match[1]) {
    // Unescape basic HTML entities
    return match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  }

  // Try reversed attribute order: <meta ... content="..." ... property="og:image">
  const ogRegexRev =
    /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i;
  const matchRev = html.match(ogRegexRev);
  if (matchRev && matchRev[1]) {
    return matchRev[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  }

  return null;
}

function truncateAndCleanHtml(html: string, maxLen = 1000): string {
  // Strip <script> and <style> entirely
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    " ",
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Replace multiple spaces/newlines
  text = text.replace(/\s+/g, " ").trim();

  return text.substring(0, maxLen);
}

export async function fetchUrlSafely(
  url: string,
  depth = 0,
): Promise<FetchedUrlContext> {
  if (depth > 1) {
    return { url, type: "error", error: "Max redirect/meta depth reached" };
  }

  if (!(await isSafeUrl(url))) {
    return { url, type: "error", error: "Unsafe URL blocked" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DiscordBot/2.0",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      // Do not follow more than a few redirects natively, fetch handles up to 20 by default
    });

    if (!response.ok) {
      return { url, type: "error", error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );

    if (contentLength > MAX_FETCH_SIZE) {
      return { url, type: "error", error: "Content too large" };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_FETCH_SIZE) {
      return { url, type: "error", error: "Downloaded content too large" };
    }

    if (contentType.startsWith("image/")) {
      return {
        url,
        type: "image",
        data: Buffer.from(buffer),
        mimeType: contentType,
      };
    }

    if (
      contentType.startsWith("text/html") ||
      contentType.startsWith("text/plain")
    ) {
      const text = Buffer.from(buffer).toString("utf-8");

      // If it's HTML, try to find an og:image first (for Tenor/Giphy etc)
      if (contentType.startsWith("text/html")) {
        const ogImage = extractOgImage(text);
        if (ogImage && ogImage.startsWith("http")) {
          // Fetch the og:image instead
          return fetchUrlSafely(ogImage, depth + 1);
        }
      }

      // Fallback to text content
      const cleaned = truncateAndCleanHtml(text, 1000);
      return {
        url,
        type: "text",
        textContent: cleaned,
      };
    }

    return {
      url,
      type: "error",
      error: `Unsupported content type: ${contentType}`,
    };
  } catch (err) {
    return {
      url,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate and filter out things that obviously aren't valid
  return Array.from(new Set(matches)).filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });
}

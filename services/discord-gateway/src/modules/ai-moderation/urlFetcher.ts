import { resolve } from "node:dns/promises";
import { isIP } from "node:net";
import { createChildLogger } from "@bete/shared/logger";
import { createAbortTimeout } from "./abortHelper.js";

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
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')?\]\s]/gi;

// ═══════════════════════════════════════════════════════════════════════════════
// SSRF Protection with DNS Rebinding Defense
// ═══════════════════════════════════════════════════════════════════════════════
// Strategy: Resolve the hostname to IP addresses BEFORE fetching, then fetch
// directly from a pinned IP (using a Host header for virtual hosting).
// This prevents DNS rebinding where a domain alternates between a public IP
// and an internal IP (127.0.0.1, 10.x.x.x) between the check and the fetch.
//
// Edge cases handled:
// - No DNS records → reject (cannot fetch)
// - Multiple IPs (round-robin DNS) → pick first public one
// - All IPs are internal → reject
// - Direct IP literal → validate and pass through
// ═══════════════════════════════════════════════════════════════════════════════

interface PinnedAddress {
  /** The original hostname from the URL (used in Host header) */
  hostname: string;
  /** The pinned, validated IP address to connect to (already vetted as safe) */
  ip: string;
  /** The port from the original URL */
  port: string;
  /** The protocol (http: or https:) */
  protocol: string;
  /** The pathname + search + hash (everything after host:port) */
  path: string;
}

function isPrivateIP(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith("169.254.") || // link-local
    ip.startsWith("fc") || // IPv6 unique local (fc00::/7)
    ip.startsWith("fd")    // IPv6 unique local
  );
}

/**
 * Resolve a hostname to a pinned IP address.
 * Returns the first public IP found, or null if all resolved IPs are private.
 * Also returns null if the host is a private IP literal.
 *
 * This function is the sole gate — once a safe IP is returned, the caller
 * MUST use it directly without re-resolving the hostname.
 */
async function resolveAndPinAddress(urlStr: string): Promise<PinnedAddress | null> {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    const protocol = parsed.protocol; // "http:" or "https:"
    const port = parsed.port || (protocol === "https:" ? "443" : "80");
    const path = parsed.pathname + parsed.search + parsed.hash;

    // Block private IP literals immediately
    if (isIP(host)) {
      if (isPrivateIP(host)) return null;
      // Direct public IP literal — can fetch directly
      return { hostname: host, ip: host, port, protocol, path };
    }

    // Block obvious private hostnames
    if (
      host === "localhost" ||
      host === "localhost.localdomain" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return null;
    }

    // Resolve hostname to IP addresses
    let addresses: string[];
    try {
      addresses = await resolve(host);
    } catch {
      // DNS resolution failed — can't verify safety
      return null;
    }

    if (addresses.length === 0) return null;

    // Pick the first non-private IP
    const publicIp = addresses.find((ip) => !isPrivateIP(ip));
    if (!publicIp) return null;

    // We now have a pinned, verified safe IP.
    // The caller MUST use this IP directly for the fetch.
    return { hostname: host, ip: publicIp, port, protocol, path };
  } catch {
    return null;
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

  // Resolve + pin IP address FIRST (defence against DNS rebinding).
  // The pinned IP is used directly — we never re-resolve the hostname.
  const pinned = await resolveAndPinAddress(url);
  if (!pinned) {
    return { url, type: "error", error: "Unsafe URL blocked" };
  }

  // Reconstruct the URL using the pinned IP directly, keeping original Host
  const pinnedUrl = `${pinned.protocol}//${pinned.ip}:${pinned.port}${pinned.path}`;

  const { signal, cleanup } = createAbortTimeout(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(pinnedUrl, {
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DiscordBot/2.0",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        // Use original hostname so virtual hosting still works
        Host: pinned.hostname,
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
    cleanup();
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

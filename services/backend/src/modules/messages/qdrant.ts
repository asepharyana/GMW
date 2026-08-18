import { config } from "@/shared/config/index";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("messages-qdrant");

export interface ArchiveHit {
  score: number;
  payload: {
    text: string;
    content_hash?: string;
    analyzed_at: number;
    expires_at: number;
  };
}

function baseUrl(): string {
  return (config.QDRANT_URL ?? "http://100.121.180.82:6333").replace(
    /\/+$/,
    "",
  );
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.QDRANT_API_KEY) h["api-key"] = config.QDRANT_API_KEY;
  return h;
}

export const ARCHIVE_COLLECTION =
  config.QDRANT_ARCHIVE_COLLECTION ?? "gmw_message_archive";

async function request(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Qdrant ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Search the archive collection for the nearest vectors to `vector`. */
export async function searchArchive(
  vector: number[],
  limit: number,
  scoreThreshold: number,
): Promise<ArchiveHit[]> {
  if (!config.QDRANT_URL) return [];
  try {
    const json = (await request(
      "POST",
      `/collections/${ARCHIVE_COLLECTION}/points/search`,
      {
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      },
    )) as {
      result?: Array<{
        score?: number;
        payload?: ArchiveHit["payload"];
      }>;
    };
    return (json.result ?? [])
      .filter((h) => h.payload?.text)
      .map((h) => ({
        score: h.score ?? 0,
        payload: h.payload as ArchiveHit["payload"],
      }));
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "archive search failed",
    );
    return [];
  }
}

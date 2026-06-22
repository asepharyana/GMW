import { execFile } from "node:child_process";
import { createChildLogger } from "@bete/shared/logger";
import { readFile, writeFile, unlink, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { delay, retryWithBackoff } from "@bete/shared/utils";
import { LRUCache } from "lru-cache";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { config } from "../../shared/config/config.js";
import { resizeImageForVision } from "../attachment-upload/imageResizer.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import { getMessageById } from "../message-capture/messageStore.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { getChannelCulture } from "./channelCultureStore.js";
import { llmChat, llmVision } from "./llmClient.js";
import { buildSystemPrompt as buildSystemPromptModular, sanitizeAiContent } from "./moderationPrompt.js";
import { logModerationAnalysis, logModerationError } from "./responseLogger.js";
import {
  getStickerFromCache,
  initStickerCache,
  isStickerCacheReady,
  uploadAndCacheSticker,
} from "./stickerCache.js";
import {
  buildCustomEmojiVisionPrompt,
  buildGeneralImageVisionPrompt,
  buildStickerTextOnlyWarning,
  buildStickerVisionPrompt,
} from "./stickerPrompt.js";
import {
  acquireMediaAnalysisLock,
  computeImagePhash,
  deleteCachedMediaAnalysis,
  getCachedMediaAnalysis,
  getCachedMediaByPhash,
  getCachedTextModeration,
  getRecentCorrectedModerations,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  makeTextModerationCacheKey,
  setCachedTextModeration,
  upsertCachedMediaAnalysis,
  upsertCachedMediaByPhash,
} from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import { getUserProfile } from "./userProfileStore.js";
import { initializeUserReputation } from "./userReputationStore.js";

export { sniffImageMimeType } from "./imageMimeSniffer.js";
export { extractJson } from "./jsonExtractor.js";
export {
  parseModerationResponse,
  sanitizeErrorMessage,
} from "./moderationResponseParser.js";
// Re-export all symbols from sub-modules to preserve public API
export {
  ModerationResponseSchema,
  RecommendedActionSchema,
  ResultItemSchema,
  SeveritySchema,
} from "./moderationSchemas.js";
export {
  clampScore,
  DEFERRAL_ANALYSIS_PATTERN,
  DEFERRAL_EXCEPTION_PATTERN,
  deriveRecommendedAction,
  deriveSeverity,
  hasDeferralAnalysis,
} from "./severityDeriver.js";

import { sniffImageMimeType } from "./imageMimeSniffer.js";
// Internal imports for functions used locally in the facade
import { parseModerationResponse } from "./moderationResponseParser.js";

const log = createChildLogger("llmModerationClient");

/**
 * Fetches recent corrected false positives from the DB and formats them
 * as additional few-shot examples for the moderation prompt.
 *
 * Returns an empty string if no corrections are available (so the prompt
 * builder simply skips the section).
 */
async function buildCorrectedFewShotExamples(): Promise<string> {
  try {
    const corrections = await getRecentCorrectedModerations(5);
    if (corrections.length === 0) return "";

    const lines = [
      "## Contoh Koreksi False Positive (dari moderasi sebelumnya)",
      "Berikut adalah koreksi manual dari false positive yang pernah terjadi. Gunakan sebagai panduan tambahan:",
    ];

    for (const c of corrections) {
      const origFlags = c.originalFlags.join(", ") || "(none)";
      const corrFlags = c.correctedFlags.join(", ") || "(clean)";
      const notes = c.correctionNotes ? ` — ${c.correctionNotes}` : "";
      lines.push(
        `- Konten: "${c.contentSnippet.substring(0, 100)}" → sebelumnya di-flag sebagai [${origFlags}], dikoreksi menjadi [${corrFlags}]${notes}`,
      );
    }

    lines.push(
      "JANGAN ulangi kesalahan yang sama. Jika konten serupa dengan contoh di atas, gunakan koreksi yang sudah ditentukan.",
    );

    return lines.join("\n");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Shared types for image resolution
// ---------------------------------------------------------------------------

type MessageImagePart = {
  type: "image_url";
  image_url: { url: string };
  sourceLabel: string;
  stickerName?: string;
  customEmojiId?: string;
  customEmojiName?: string;
};

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

/**
 * Returns the real text content for AI analysis, stripping fallback text
 * that getDisplayContent() synthesized ("[Attachment: ...]", "[Sticker: ...]",
 * "[Embed]").  These filenames alone are meaningless to the LLM and can
 * falsely inflate a "clean" verdict when the actual image failed to download.
 */
function getAnalysisContent(message: MessageRecord): string {
  const raw = message.edited_content ?? message.content;
  const stripped = raw.replace(
    /\[(?:Attachment|Sticker):[^\]]*\]|\[Embed\]/g,
    "",
  );
  return stripped.trim();
}

/**
 * Builds a <reference> XML element for reply/forward/crosspost context.
 * Fetches the parent message content if available so the LLM can evaluate
 * the reply in context.
 */
async function buildReferenceXml(msg: MessageRecord): Promise<string> {
  const parts: string[] = [];
  if (msg.is_reply && msg.reference_message_id) {
    parts.push(`type="reply"`);
  } else if (msg.is_forward && msg.reference_message_id) {
    parts.push(`type="forward"`);
  }
  if (msg.is_crosspost) {
    parts.push(`type="crosspost"`);
  }
  if (!msg.reference_message_id) return "";

  // Try to fetch parent message content
  let parentContent = "";
  if (msg.reference_message_id) {
    try {
      const parent = await getMessageById(msg.reference_message_id);
      if (parent) {
        const parentText = parent.edited_content ?? parent.content;
        parentContent = parentText.slice(0, 500);
      }
    } catch {
      // Parent fetch failed — still inject reference with available info
    }
  }

  const attr = parts.join(" ");
  const parentXml = parentContent
    ? `<parent_content>${escapeXml(parentContent)}</parent_content>`
    : "";
  return `<reference ${attr} message_id="${msg.reference_message_id}" channel_id="${msg.reference_channel_id ?? ""}" guild_id="${msg.reference_guild_id ?? ""}">${parentXml}</reference>`;
}

/** Simple XML-escaping for content text. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Media detection helper
// ---------------------------------------------------------------------------

function hasMediaContent(
  target: MessageRecord,
  attachments?: AttachmentRecord[],
): boolean {
  if (target.metadata) {
    const evidence = extractMessageMediaEvidence(target.metadata);
    // Check all media types from metadata — attachments in particular are
    // captured at message-creation time so they exist before the DB record.
    if (
      evidence.stickers.length > 0 ||
      evidence.embeds.length > 0 ||
      evidence.attachments.length > 0
    )
      return true;
  }
  if (attachments?.some((a) => a.message_id === target.id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Single-image vision analysis (reused by both text-only and media paths)
// ---------------------------------------------------------------------------

/**
 * In-memory LRU cache for vision analysis results.
 * Fastest path — avoids DB round-trip for frequently seen images.
 * Max 500 entries, 24-hour TTL.
 */
const visionLruCache = new LRUCache<string, string>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000,
});

/**
 * In-flight deduplication map — prevents concurrent vision API calls for
 * the same cache key. Multiple concurrent requests for an identical image
 * share the same promise, eliminating the race condition between cache
 * check and cache write.
 */
const inFlightVisionCalls = new Map<string, Promise<string>>();

const FAILED_ANALYSIS_PREFIX =
  "GAGAL DIANALISIS — gambar tidak dapat diunduh atau vision API gagal setelah 3x percobaan. JANGAN mengasumsikan gambar aman hanya karena gagal dianalisis. Gunakan metadata URL/nama file saja sebagai petunjuk.";

const analyzeSingleMediaImage = async (
  messageId: string,
  image: MessageImagePart,
): Promise<string> => {
  const cacheKey = image.customEmojiId
    ? makeCustomEmojiCacheKey(image.customEmojiId)
    : image.stickerName
      ? makeStickerCacheKey(image.stickerName)
      : makeImageCacheKey(image.image_url.url);

  // Layer 0: In-memory LRU cache (fastest — no DB or network I/O)
  const lruCached = visionLruCache.get(cacheKey);
  if (lruCached) {
    log.debug({ cacheKey }, "Vision LRU cache HIT (in-memory)");
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${lruCached}`;
  }

  // Layer 1: DB cache
  const cached = await getCachedMediaAnalysis(cacheKey);
  if (cached) {
    visionLruCache.set(cacheKey, cached);
    log.debug({ cacheKey }, "Media analysis cache HIT (DB → LRU)");
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${cached}`;
  }

  // Deduplicate in-flight vision calls: if another caller is already
  // processing this exact image, wait for it instead of starting a duplicate.
  const existing = inFlightVisionCalls.get(cacheKey);
  if (existing) {
    log.debug(
      { cacheKey },
      "Media analysis in-flight dedupe — waiting for existing call",
    );
    const result = await existing;
    // result is never null — the promise always returns a descriptive string
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${result}`;
  }

  const promptText = image.stickerName
    ? buildStickerVisionPrompt(image.stickerName, messageId)
    : image.customEmojiName
      ? buildCustomEmojiVisionPrompt(image.customEmojiName, messageId)
      : buildGeneralImageVisionPrompt(image.sourceLabel, messageId);

  const visionPromise = (async (): Promise<string> => {
    // Attempt to acquire DISTRIBUTED lock
    // Lock expires in 60 seconds (generous timeout for LLM)
    const locked = await acquireMediaAnalysisLock(cacheKey, Date.now() + 60000);

    if (!locked) {
      log.debug(
        { cacheKey },
        "Media analysis distributed lock acquired by another pod. Polling...",
      );
      // Poll DB for up to 30 seconds
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const pollCached = await getCachedMediaAnalysis(cacheKey);
        if (pollCached) {
          visionLruCache.set(cacheKey, pollCached);
          return pollCached;
        }
      }
      log.warn(
        { cacheKey },
        "Polling for distributed media analysis timed out. Falling back.",
      );
      return FAILED_ANALYSIS_PREFIX;
    }

    // Layer 2: Perceptual hash pre-check (before expensive vision API call)
    let phash: string | null = null;
    if (image.image_url.url.startsWith("data:")) {
      try {
        const base64Data = image.image_url.url.split(",")[1];
        if (base64Data) {
          const imgBuffer = Buffer.from(base64Data, "base64");
          phash = await computeImagePhash(imgBuffer);
          if (phash) {
            const phashCached = await getCachedMediaByPhash(phash);
            if (phashCached) {
              log.debug(
                { cacheKey, phash: phash.slice(0, 16) },
                "Vision phash HIT — reusing analysis",
              );
              visionLruCache.set(cacheKey, phashCached);
              await upsertCachedMediaAnalysis(
                cacheKey,
                phashCached,
                "vision_llm",
                Date.now() + 24 * 60 * 60 * 1000,
              ).catch(() => {});
              return phashCached;
            }
          }
        }
      } catch {
        // phash failed — continue with normal vision API flow
        phash = null;
      }
    }

    // ── Vision API call with EXTERNAL exponential backoff ──
    // Uses retryWithBackoff directly so each retry has proper backoff delay.
    // llmVision calls llmChat which also has retryWithBackoff, but its
    // inner backoff has minTimeout=0 (instant).  Our outer backoff ensures
    // meaningful delay between full attempts.
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const content = await llmVision(promptText, image.image_url);
        if (content) {
          // Success — persist to all cache layers
          await upsertCachedMediaAnalysis(
            cacheKey,
            content,
            "vision_llm",
            Date.now() + 24 * 60 * 60 * 1000,
          );
          visionLruCache.set(cacheKey, content);
          if (phash) {
            upsertCachedMediaByPhash(
              phash,
              content,
              "vision_llm",
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).catch(() => {});
          }
          return content;
        }
        // llmVision returned null (no API key / client unavailable) — no point retrying
        log.warn(
          { messageId },
          "Vision API client unavailable (null response) — skipping retry",
        );
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          const backoffMs = Math.min(
            2_000 * 3 ** attempt + Math.random() * 500,
            30_000,
          );
          log.warn(
            {
              messageId,
              attempt: attempt + 1,
              backoffMs,
              error: lastError.message,
            },
            "Vision API attempt failed — backing off before retry",
          );
          await delay(backoffMs);
        }
      }
    }

    // All attempts exhausted — return descriptive failure text.
    // NOT null: the caller must always have a descriptive string to
    // inject into the prompt so the LLM knows the image was skipped.
    log.warn(
      {
        messageId,
        lastError: lastError?.message ?? "null response",
      },
      "Vision analysis failed after all retry attempts",
    );
    await deleteCachedMediaAnalysis(cacheKey).catch(() => {});
    return FAILED_ANALYSIS_PREFIX;
  })();

  inFlightVisionCalls.set(cacheKey, visionPromise);

  try {
    const content = await visionPromise;
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${content}`;
  } catch (outerErr) {
    // Should never reach here — visionPromise has its own catch that
    // returns FAILED_ANALYSIS_PREFIX.  Log anyway for debugging.
    log.error(
      {
        messageId,
        cacheKey,
        error: outerErr instanceof Error ? outerErr.message : String(outerErr),
      },
      "Unexpected rejection in analyzeSingleMediaImage (visionPromise threw)",
    );
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${FAILED_ANALYSIS_PREFIX}`;
  } finally {
    inFlightVisionCalls.delete(cacheKey);
  }
};

// ---------------------------------------------------------------------------
// Shared LLM call + parse + fallback helper
// ---------------------------------------------------------------------------

/**
 * State object shared between the caller and callModerationLLM so that
 * parse-error feedback can be injected into subsequent retry attempts.
 *
 * The caller creates this object, passes it to callModerationLLM, and
 * the internal retry loop mutates it before re-invoking buildContent().
 */
interface RetryState {
  lastParseError: string | null;
  lastInvalidContent: string | null;
}

/**
 * Execute a single LLM moderation call (batch or single-message) with retry
 * logic, JSON parse, and fallback error markers on failure.
 *
 * Uses JSON Schema response format (R2) and concurrency limiter (R3).
 */
async function callModerationLLM(
  buildContent: (state: RetryState) => Promise<string>,
  targetIds: string[],
  label: string,
  signal?: AbortSignal,
): Promise<{
  results: AnalysisResult[];
  raw: ChatCompletion | null;
}> {
  const state: RetryState = {
    lastParseError: null,
    lastInvalidContent: null,
  };

  let parsed: AnalysisResult[];
  let result: ChatCompletion | null = null;

  try {
    const analysis = await retryWithBackoff(
      async () => {
        try {
          const content = await buildContent(state);

          const completion = await llmChat({
            messages: [{ role: "user", content }],
            max_tokens: 16384,
            jsonResponse: { type: "json_object" },
            retries: 0,
            signal,
          });

          if (!completion) {
            throw new Error("LLM client unavailable (no API key)");
          }

          if (
            !completion.choices ||
            !Array.isArray(completion.choices) ||
            !completion.choices[0]
          ) {
            throw new Error("Invalid LLM response structure");
          }

          const rawContent = completion.choices[0].message?.content;
          if (!rawContent) {
            throw new Error("No content in LLM response");
          }

          try {
            return {
              parsed: parseModerationResponse(rawContent, targetIds),
              result: completion,
            };
          } catch (parseError) {
            state.lastParseError =
              parseError instanceof Error
                ? parseError.message
                : String(parseError);
            state.lastInvalidContent = rawContent;
            log.warn(
              {
                error: state.lastParseError,
                contentLength: rawContent.length,
                contentPreview: rawContent.substring(0, 1000),
                targetIds,
                model: config.AI_LLM_MODEL,
              },
              `Failed to parse moderation response from LLM (${label})`,
            );
            throw parseError;
          }
        } catch (apiError: any) {
          // 429 → retryable with backoff (rate limited — the provider may recover)
          // GitHub Issue #429-cascade: 429 was previously an AbortError which skipped
          // retries and caused immediate re-queues, creating a tight rate-limit cascade.
          // Now treated as retryable with generous backoff so the provider can recover.
          if (apiError?.status === 429) {
            log.warn(
              {
                status: 429,
                targetIds,
                model: config.AI_LLM_MODEL,
                label,
              },
              "LLM API 429 rate limited — will retry with backoff",
            );
            // Add a small jitter to prevent thundering herd on retry
            const jitterMs = Math.floor(Math.random() * 1000) + 500;
            await delay(jitterMs);
            throw apiError;
          }
          // 401/403 → abort immediately, never retry
          if (apiError?.status === 401 || apiError?.status === 403) {
            const abortErr = new Error(String(apiError));
            abortErr.name = "AbortError";
            throw abortErr;
          }
          // 5xx server errors → retryable transient errors
          // p-retry will retry these; on final exhaustion the outer catch
          // will produce synthetic error results for all targets
          if (
            apiError?.status >= 500 ||
            apiError?.code === "ECONNRESET" ||
            apiError?.code === "ETIMEDOUT" ||
            apiError?.name === "APIError"
          ) {
            // re-throw as-is so p-retry can retry
            throw apiError;
          }
          throw apiError;
        }
      },
      {
        retries: 3,
        minTimeout: 5_000,
        maxTimeout: 60_000,
        factor: 3,
        signal,
      },
    );
    parsed = analysis.parsed;
    result = analysis.result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    const isApiError = !state.lastInvalidContent;

    // For API errors (502, timeout, etc.) where retries exhausted, produce
    // synthetic error results so the batch doesn't crash entirely.
    // For parse errors, we already have lastInvalidContent and the existing
    // fallback path below handles it.
    const apiErrorCode = isApiError
      ? `MOD_${Date.now().toString(36).slice(0, 6)}`
      : null;

    if (isApiError) {
      log.warn(
        {
          error: errorMsg,
          targetIds,
          model: config.AI_LLM_MODEL,
          label,
        },
        `LLM API error after retries exhausted (${label}) — marking all targets as analysis errors`,
      );

      logModerationError(
        targetIds,
        config.AI_LLM_MODEL,
        err instanceof Error ? err : new Error(String(err)),
        {
          phase: "api_call",
          label,
        },
      );

      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error",
        flags: ["analysis_api_failed"],
        score: 0,
        analysis: `Analisis gagal karena error pada server AI dan memerlukan pemeriksaan manual. Error code: ${apiErrorCode}`,
        categories: ["analysis_api_failed"],
        severity: "none",
        confidence: 0,
        recommendedAction: "review",
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    } else {
      // Parse error fallback — existing path
      const parseMsg = err instanceof Error ? err.message : String(err);
      const contentPreview =
        state.lastInvalidContent?.substring(0, 500) ?? "<empty>";
      const contentLen = state.lastInvalidContent?.length ?? 0;

      log.error(
        {
          error: parseMsg,
          contentLength: contentLen,
          contentPreview,
          targetIds,
          model: config.AI_LLM_MODEL,
          timestamp: new Date().toISOString(),
        },
        `Robust Fallback (${label}): Failed to parse moderation response. Marking all targets as analysis errors.`,
      );

      // Log error with responseLogger
      logModerationError(
        targetIds,
        config.AI_LLM_MODEL,
        err instanceof Error ? err : new Error(String(err)),
        {
          phase: "parse_response",
          label,
          contentLength: contentLen,
        },
      );

      // Sanitized error messages — no internal details exposed (R10)
      const errorCode = `MOD_${Date.now().toString(36).slice(0, 6)}`;
      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error",
        flags: ["analysis_parse_failed"],
        score: 0,
        analysis: `Analisis gagal dan memerlukan pemeriksaan manual. Error code: ${errorCode}`,
        categories: ["analysis_parse_failed"],
        severity: "none",
        confidence: 0,
        recommendedAction: "review",
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    }
  }

  return { results: parsed, raw: result };
}

// ---------------------------------------------------------------------------
// Text-only fast path — with batch size splitting (R6)
// ---------------------------------------------------------------------------

/**
 * Run a lightweight batch analysis on text-only messages.
 *
 * If targets exceed AI_LLM_TEXT_BATCH_SIZE, split into sub-batches
 * and run sequentially to avoid overwhelming the LLM (R6).
 */
async function runTextOnlyBatch(
  targets: MessageRecord[],
  contextText: string,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  const maxBatchSize = config.AI_LLM_TEXT_BATCH_SIZE ?? 20;
  const timeoutMs = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;

  // ── Fetch web content from URLs in text-only messages ──
  // Prevents LLM from guessing based on domain name alone (e.g., false "scam" flags).
  // The fetched text content is injected into the message XML so the LLM can
  // analyze the actual page rather than pattern-match the URL string.
  const urlFetchMap = new Map<string, string>(); // url → fetched text content
  {
    const allUrls = new Set<string>();
    for (const msg of targets) {
      const content = msg.edited_content ?? msg.content;
      for (const url of extractUrlsFromText(content)) {
        allUrls.add(url);
      }
    }
    const urlArr = Array.from(allUrls).slice(0, 10); // cap to 10 fetches per batch
    if (urlArr.length > 0) {
      log.debug(
        { urlCount: urlArr.length },
        "Fetching web content for text-only batch URLs",
      );
      const results = await Promise.allSettled(
        urlArr.map((url) => fetchUrlSafely(url)),
      );
      for (let i = 0; i < urlArr.length; i++) {
        const r = results[i];
        if (
          r.status === "fulfilled" &&
          r.value.type === "text" &&
          r.value.textContent
        ) {
          urlFetchMap.set(urlArr[i], r.value.textContent);
        }
      }
    }
  }

  // ── Group identical short messages (< 20 chars) to reduce redundant analysis ──
  // Messages with identical normalized content share a single representative.
  // Results are fanned out to all group members after the LLM call.
  const shortContentGroups = new Map<string, MessageRecord[]>();
  const deduplicatedTargets: MessageRecord[] = [];
  const groupMapping = new Map<string, string[]>(); // representativeId → [all memberIds]

  for (const msg of targets) {
    const rawContent = (msg.edited_content ?? msg.content).trim();
    if (rawContent.length > 0 && rawContent.length < 20) {
      const groupKey = rawContent.toLowerCase();
      if (shortContentGroups.has(groupKey)) {
        shortContentGroups.get(groupKey)?.push(msg);
      } else {
        shortContentGroups.set(groupKey, [msg]);
        deduplicatedTargets.push(msg); // first occurrence = representative
      }
    } else {
      deduplicatedTargets.push(msg);
    }
  }

  // Build group mapping for results fan-out
  for (const [, members] of shortContentGroups) {
    if (members.length > 1) {
      const rep = members[0];
      groupMapping.set(
        rep.id,
        members.map((m) => m.id),
      );
    }
  }

  if (groupMapping.size > 0) {
    log.debug(
      {
        originalCount: targets.length,
        deduplicatedCount: deduplicatedTargets.length,
        groupsFormed: groupMapping.size,
      },
      "Grouped identical short messages for text batch",
    );
  }

  // Split into sub-batches if needed (R6) — using deduplicated targets
  const subBatches: MessageRecord[][] = [];
  for (let i = 0; i < deduplicatedTargets.length; i += maxBatchSize) {
    subBatches.push(deduplicatedTargets.slice(i, i + maxBatchSize));
  }

  if (subBatches.length > 1) {
    log.debug(
      {
        totalTargets: targets.length,
        subBatchCount: subBatches.length,
        maxBatchSize,
      },
      "Text targets exceed batch size limit — splitting into sub-batches",
    );
  }

  const allResults: AnalysisResult[] = [];
  let lastRaw: unknown = null;

  const channelId = targets.length > 0 ? targets[0].channel_id : "";
  const channelCultureObj = channelId
    ? await getChannelCulture(channelId)
    : null;
  const channelCulture = channelCultureObj
    ? channelCultureObj.culture_summary
    : undefined;

  // Log channel culture & user profiles for debugging
  if (channelCulture) {
    log.debug(
      { channelId, culturePreview: channelCulture.slice(0, 120) },
      "Injected channel culture into prompt",
    );
  }

  // Run sub-batches sequentially to avoid rate limits
  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

    // Abstract user reputation (no history — prevents confirmation bias)
    const userContexts = new Map<string, string>();
    const userProfiles = new Map<string, string>();
    for (const msg of batch) {
      if (!userContexts.has(msg.user_id)) {
        const rep = await initializeUserReputation(msg.user_id, msg.guild_id);
        const contextStr = `<user_reputation trust_score="${rep.trust_score}" />`;
        userContexts.set(msg.user_id, contextStr);
      }
      if (!userProfiles.has(msg.user_id)) {
        const profile = await getUserProfile(msg.user_id);
        userProfiles.set(
          msg.user_id,
          profile
            ? `<user_profile>${sanitizeAiContent(profile.profile_summary)}</user_profile>`
            : "",
        );
      }
    }

    const buildContent = async (state: RetryState): Promise<string> => {
      const correction = state.lastParseError
        ? {
            error: state.lastParseError,
            preview: state.lastInvalidContent?.slice(0, 800) ?? "<empty>",
          }
        : undefined;

      // Use modular system prompt with XML delimiters (R1, R7, R8)
      const correctedExamples = await buildCorrectedFewShotExamples();
      const systemText = buildSystemPromptModular({
        contextText,
        mode: "text",
        correction,
        correctedExamples,
        channelCulture,
      });

      const messagesBlock = await Promise.all(
        batch.map(async (msg) => {
          const content = getAnalysisContent(msg);

          // Inject fetched web content for URLs found in this message
          const msgUrls = extractUrlsFromText(content);
          const urlContexts = msgUrls
            .map((url) => {
              const fetchedText = urlFetchMap.get(url);
              if (!fetchedText) return null;
              return `<web_content url="${escapeXml(url)}">${escapeXml(fetchedText)}</web_content>`;
            })
            .filter(Boolean)
            .join("\n");
          const webContext = urlContexts ? `\n${urlContexts}` : "";
          const userCtx = userContexts.get(msg.user_id) ?? "";
          const userProfileCtx = userProfiles.get(msg.user_id) ?? "";

          // XML delimiters wrap each message for prompt safety (R1)
          const profileLine = userProfileCtx ? `\n  ${userProfileCtx}` : "";
          const refXml = await buildReferenceXml(msg);
          const refLine = refXml ? `\n  ${refXml}` : "";
          return `<message id="${msg.id}" user="${msg.username}">\n  ${userCtx}${profileLine}${refLine}\n  <content>${escapeXml(content)}</content>${webContext}\n</message>`;
        }),
      ).then((blocks) => blocks.join("\n"));

      // XML delimiter wraps the entire messages block (R1)
      return `${systemText}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);
    timeoutId.unref();

    let batchResult: { results: AnalysisResult[]; raw: unknown };
    try {
      batchResult = await callModerationLLM(
        buildContent,
        targetIds,
        `text-batch-${i + 1}`,
        abortController.signal,
      );
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        throw new Error(
          `Text-only batch sub-batch ${i + 1} timed out for messages ${targetIds.join(", ")}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const rawUsage = (
      batchResult.raw as {
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      }
    )?.usage;
    // Fan-out results from representative messages to all group members
    const fannedOutResults =
      groupMapping.size > 0
        ? batchResult.results.flatMap((result) => {
            const members = groupMapping.get(result.messageId);
            if (members) {
              return members.map((memberId) => ({
                ...result,
                messageId: memberId,
              }));
            }
            return [result];
          })
        : batchResult.results;
    allResults.push(...fannedOutResults);
    if (batchResult.raw) lastRaw = batchResult.raw;

    // Log batch results with comprehensive details
    logModerationAnalysis(
      targetIds,
      config.AI_LLM_MODEL,
      batchResult.results,
      0, // Duration will be tracked at higher level
      rawUsage
        ? {
            prompt_tokens: rawUsage.prompt_tokens,
            completion_tokens: rawUsage.completion_tokens,
            total_tokens: rawUsage.total_tokens,
          }
        : undefined,
    );
  }

  log.debug(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      subBatchCount: subBatches.length,
    },
    "Text-only batch analysis complete",
  );

  return { results: allResults, raw: lastRaw };
}

// ---------------------------------------------------------------------------
// Prepared media message — download + vision phase, no LLM call yet.
// Multiple prepared messages are batched into a single LLM call below.
// ---------------------------------------------------------------------------

interface PreparedMediaMessage {
  targetId: string;
  messageBlock: string;
}

/**
 * Download images, run vision analysis, and build the message XML block
 * for a single media-bearing message.  Does NOT make the moderation LLM call
 * — that happens in batch in `runMediaBatch`.
 *
 * Steps:
 * 1. Download attachment images (resized via sharp — R5)
 * 2. Fetch URLs found in the message body
 * 3. Download sticker/embed images (resized via sharp — R5)
 * 4. Run vision analysis on every image (with DB + sticker cache)
 * 5. Build a single-message XML block with media context (R1)
 */
async function prepareMediaMessage(
  target: MessageRecord,
  allAttachments: AttachmentRecord[] | undefined,
): Promise<PreparedMediaMessage> {
  const targetId = target.id;

  // ── State maps for this single message ──
  const imageMap = new Map<string, MessageImagePart[]>();
  const webTextMap = new Map<string, string[]>();
  const mediaAnalysisMap = new Map<string, string[]>();

  const maxDimension = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;
  const content = getAnalysisContent(target);

  // ── 1-3. Parallel download of ALL media sources ──
  const downloadPromises: Array<Promise<void>> = [];

  // ── Attachment downloads ──
  const msgAttachments = (allAttachments ?? [])
    .filter(
      (att) =>
        att.message_id === targetId &&
        (att.uploaded_url ?? att.discord_url ?? null) &&
        (att.type.startsWith("image/") || att.type.startsWith("video/")),
    )
    .slice(0, 8);

  for (const att of msgAttachments) {
    downloadPromises.push(
      downloadSingleAttachment(att, targetId, maxDimension, imageMap),
    );
  }

  // ── URL fetch promises ──
  const urls = extractUrlsFromText(content).slice(0, 3);
  const urlWebTexts: string[] = [];

  for (const url of urls) {
    downloadPromises.push(
      fetchUrlInline(url, targetId, maxDimension, imageMap, urlWebTexts),
    );
  }

  // ── Sticker / embed / custom emoji download promises ──
  const mediaEvidence = extractMessageMediaEvidence(target.metadata);
  const mediaCandidates = buildMediaCandidates(targetId, mediaEvidence);

  for (const candidate of mediaCandidates) {
    downloadPromises.push(
      downloadMediaCandidate(
        candidate,
        targetId,
        maxDimension,
        imageMap,
        mediaAnalysisMap,
      ),
    );
  }

  // Execute ALL media downloads in parallel
  await Promise.all(downloadPromises);

  // Collect web text results from URL fetches
  if (urlWebTexts.length > 0) webTextMap.set(targetId, urlWebTexts);

  // ── 4. Vision analysis for every image ──
  await Promise.all(
    Array.from(imageMap.entries()).flatMap(([msgId, images]) =>
      images.map(async (image) => {
        const summary = await analyzeSingleMediaImage(msgId, image);
        const existing = mediaAnalysisMap.get(msgId) ?? [];
        existing.push(summary);
        mediaAnalysisMap.set(msgId, existing);
      }),
    ),
  );

  // ── 5. Build single-message XML block (R1) ──
  const webTexts = webTextMap.get(targetId) ?? [];
  const mediaAnalyses = mediaAnalysisMap.get(targetId) ?? [];
  const webContext = webTexts.length > 0 ? `\n${webTexts.join("\n")}` : "";
  const mediaAnalysisContext =
    mediaAnalyses.length > 0 ? `\n${mediaAnalyses.join("\n")}` : "";

  const mediaContext = [
    mediaEvidence.stickers.length > 0
      ? mediaEvidence.stickers
          .map((s) => buildStickerTextOnlyWarning(s.name, s.url))
          .join(" ")
      : null,
    mediaEvidence.embeds.length > 0
      ? `[embed evidence: ${mediaEvidence.embeds
          .map((e) =>
            [e.title, e.description, e.url, e.image, e.thumbnail]
              .filter(Boolean)
              .join(" | "),
          )
          .join(" || ")}]`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const rep = await initializeUserReputation(target.user_id, target.guild_id);
  const userCtx = `<user_reputation trust_score="${rep.trust_score}" />`;
  const profile = await getUserProfile(target.user_id);
  const userProfileCtx = profile
    ? `\n  <user_profile>${sanitizeAiContent(profile.profile_summary)}</user_profile>`
    : "";
  const refXml = await buildReferenceXml(target);
  const refLine = refXml ? `\n  ${refXml}` : "";

  const messageBlock = `<message id="${escapeXml(target.id)}" user="${escapeXml(target.username)}">\n  ${userCtx}${userProfileCtx}${refLine}\n  <content>${escapeXml(content)}</content>${mediaContext ? ` ${escapeXml(mediaContext)}` : ""}${webContext}${mediaAnalysisContext}\n</message>`;

  return { targetId, messageBlock };
}

// ---------------------------------------------------------------------------
// Media batch analysis — ALL media messages in a SINGLE LLM call
// ---------------------------------------------------------------------------

/**
 * Analyse ALL media-bearing messages in a single batched LLM call.
 *
 * 1. Download + vision-analyse images for every message in parallel (I/O).
 * 2. Build ONE prompt with ALL prepared message blocks.
 * 3. ONE LLM call → batch-parsed response for all messages.
 *
 * This replaces the previous one-LLm-call-per-message pattern which caused
 * long queues when many media messages were pending.  With batching,
 * 50 media messages = 1 LLM call instead of 50 sequential calls.
 */
async function runMediaBatch(
  targets: MessageRecord[],
  contextText: string,
  attachments: AttachmentRecord[] | undefined,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  // Lazy init sticker cache once for the entire batch
  if (!isStickerCacheReady()) {
    await initStickerCache().catch((err: unknown) => {
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Sticker cache init failed — continuing without cache",
      );
    });
  }

  // ── Phase A: Prepare ALL messages in parallel (download + vision) ──
  // This is I/O bound (network downloads, sharp processing) so we run
  // ALL concurrently without the LLM concurrency limiter.
  const prepared = await Promise.all(
    targets.map((target) => prepareMediaMessage(target, attachments)),
  );

  // ── Phase B: ONE batched LLM call ──
  // Build shared prompt context once, combine all message blocks.
  const targetIds = targets.map((t) => t.id);

  const channelId = targets[0].channel_id;
  const channelCultureObj = channelId
    ? await getChannelCulture(channelId)
    : null;
  const channelCulture = channelCultureObj
    ? channelCultureObj.culture_summary
    : undefined;

  // Log channel culture for debugging
  if (channelCulture) {
    log.debug(
      { channelId, culturePreview: channelCulture.slice(0, 120) },
      "Injected channel culture into prompt (media path)",
    );
  }

  const correctedExamples = await buildCorrectedFewShotExamples();
  const systemText = buildSystemPromptModular({
    contextText,
    mode: "mixed",
    correctedExamples,
    channelCulture,
  });

  const messagesBlock = prepared.map((p) => p.messageBlock).join("\n");
  const userContent = `${systemText}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;

  // Overall timeout: proportional to batch size but capped at 5 minutes.
  // The prepare phase (downloads) is already bounded by per-fetch timeouts,
  // so this timeout primarily guards the LLM call itself.
  const perMsgTimeout = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;
  const batchTimeout = Math.min(
    Math.max(perMsgTimeout, perMsgTimeout * targets.length),
    300_000,
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), batchTimeout);
  timeoutId.unref();

  try {
    const result = await callModerationLLM(
      async (_state: RetryState) => userContent,
      targetIds,
      `media-batch:${targetIds.length}msgs`,
      abortController.signal,
    );

    log.info(
      {
        mediaCount: targets.length,
        resultCount: result.results.length,
      },
      "Media batch analysis complete (single LLM call)",
    );

    return result;
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      throw new Error(
        `Media batch analysis timed out after ${batchTimeout}ms for ${targets.length} messages`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Main entry point — splits text-only vs media, runs both paths in parallel
// ---------------------------------------------------------------------------

interface ModerationInput {
  targets: MessageRecord[];
  contextText: string;
  attachments?: AttachmentRecord[];
}

interface ModerationOutput {
  results: AnalysisResult[];
  raw: unknown;
}

/**
 * Runs LLM-based moderation analysis on messages.
 *
 * Architecture:
 * - **Text-only messages** → single batch LLM call (fast, no image processing)
 *   - Split into sub-batches if exceeding AI_LLM_TEXT_BATCH_SIZE (R6)
 * - **Media messages** → ALL messages prepared in parallel (download + vision),
 *   then ONE batched LLM call with all results.
 *   - Previously one-LLM-call-per-message which caused long queues.
 *   - Now N media messages → 1 LLM call regardless of N.
 * - Both paths execute **in parallel** — text batch does NOT wait for media.
 * - I/O phase (downloads) is unlimited; the LLM call respects concurrency limiter (R3).
 */
export async function runModerationAnalysis(
  input: ModerationInput,
): Promise<ModerationOutput> {
  const { targets, contextText, attachments } = input;

  if (!targets.length) {
    throw new Error("No targets provided for analysis");
  }

  // ── Per-user moderation cache check ──
  // For text-only messages: check if we've already analyzed the same
  // (user, content) pair within the last 24 hours.  If so, reuse the
  // cached result to save LLM calls (especially for repeat spam).
  const cacheHits: AnalysisResult[] = [];
  const uncachedTargets: MessageRecord[] = [];
  const seenCacheKeys = new Set<string>(); // dedupe identical content within same batch

  for (const target of targets) {
    // Only cache text-only messages (media has dynamic image fetches)
    const hasMedia = hasMediaContent(target, attachments);
    if (hasMedia) {
      uncachedTargets.push(target);
      continue;
    }

    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) {
      uncachedTargets.push(target);
      continue;
    }

    const cacheKey = makeTextModerationCacheKey(rawContent);
    // Deduplicate: if two identical messages from same user in this batch,
    // skip the cache lookup for the second and reuse the first's result.
    if (seenCacheKeys.has(cacheKey)) {
      // Synthesize a copy of the previous cache hit result for this duplicate
      const previousHit = cacheHits.find((h) => h.messageId !== target.id);
      if (previousHit) {
        cacheHits.push({
          ...previousHit,
          messageId: target.id,
        });
      } else {
        uncachedTargets.push(target);
      }
      continue;
    }
    seenCacheKeys.add(cacheKey);

    try {
      const cached = await getCachedTextModeration(cacheKey);
      if (cached) {
        // Safety: skip cache entries that are artifacts of API/parse errors.
        // A previous bug cached error results as "flagged", causing 24h false positives.
        // This guards against both legacy corrupt entries and any future write-path bugs.
        const hasMediaInMeta =
          target.metadata &&
          (() => {
            const ev = extractMessageMediaEvidence(target.metadata);
            return (
              ev.attachments.length > 0 ||
              ev.stickers.length > 0 ||
              ev.embeds.length > 0
            );
          })();

        if (hasMediaInMeta) {
          log.debug(
            {
              messageId: target.id,
              cacheKey,
            },
            "Cache entry exists but message has media in metadata — treating as miss",
          );
        } else if (
          cached.flags.some((f) =>
            [
              "analysis_api_failed",
              "analysis_parse_failed",
              "analysis_incomplete",
            ].includes(f),
          )
        ) {
          log.warn(
            { messageId: target.id, cacheKey },
            "Cache entry contains error artifact — treating as miss",
          );
        } else {
          cacheHits.push({
            messageId: target.id,
            status: cached.status,
            flags: cached.flags,
            score: cached.score,
            analysis: cached.analysis,
            categories: cached.categories,
            severity: cached.severity as AnalysisResult["severity"],
            confidence: cached.confidence,
            recommendedAction:
              cached.recommendedAction as AnalysisResult["recommendedAction"],
            policyVersion: "cached-user-moderation-2026-06",
            evidence: [],
          });
          log.debug(
            { messageId: target.id, userId: target.user_id, cacheKey },
            "User moderation cache HIT — reusing previous result",
          );
          continue;
        }
      }
    } catch {
      // Cache lookup failed — proceed with uncached path
    }

    uncachedTargets.push(target);
  }

  if (cacheHits.length > 0) {
    log.info(
      {
        cacheHits: cacheHits.length,
        uncached: uncachedTargets.length,
        total: targets.length,
      },
      "User moderation cache applied — skipping LLM call for cached targets",
    );
  }

  // If all targets were cache hits, return early
  if (uncachedTargets.length === 0) {
    return { results: cacheHits, raw: null };
  }

  // ── Split uncached targets ──
  const textOnlyTargets: MessageRecord[] = [];
  const mediaTargets: MessageRecord[] = [];

  for (const target of uncachedTargets) {
    if (hasMediaContent(target, attachments)) {
      mediaTargets.push(target);
    } else {
      textOnlyTargets.push(target);
    }
  }

  log.debug(
    {
      total: targets.length,
      textOnly: textOnlyTargets.length,
      media: mediaTargets.length,
      cacheHits: cacheHits.length,
    },
    "Split uncached targets for parallel moderation analysis",
  );

  // ── Run both paths in parallel ──
  // Text paths run in a single batch call; media paths run download+vision
  // for all messages in parallel, then ONE LLM batch call (R3 concurrency
  // limiter applies only to the single LLM call, not to the I/O phase).
  const [textBatchResult, mediaBatchResult] = await Promise.all([
    // Text-only: one fast batch call (or multiple sub-batches)
    textOnlyTargets.length > 0
      ? runTextOnlyBatch(textOnlyTargets, contextText)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),

    // Media: ALL messages downloaded + analysed in ONE batched LLM call
    mediaTargets.length > 0
      ? runMediaBatch(mediaTargets, contextText, attachments)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),
  ]);

  // ── Store uncached text-only results in cache ──
  const textResults = textBatchResult.results;
  for (const result of textResults) {
    const target = textOnlyTargets.find((t) => t.id === result.messageId);
    if (!target) continue;

    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) continue;

    // Do NOT cache error results (API failures, parse failures, incomplete).
    // Caching a transient error would turn it into a 24h false positive.
    if (result.status === "error") continue;

    // Do NOT cache text-only analysis for messages with media evidence in
    // metadata (attachments, stickers, embeds).  A complete analysis needs
    // full media context, and caching a text-only result would prevent future
    // media-aware re-analysis.  The attachment DB record may not exist yet
    // due to a race condition, so we check the message's own metadata field.
    if (target.metadata) {
      const evidence = extractMessageMediaEvidence(target.metadata);
      if (
        evidence.attachments.length > 0 ||
        evidence.stickers.length > 0 ||
        evidence.embeds.length > 0
      ) {
        log.debug(
          {
            messageId: target.id,
            attachments: evidence.attachments.length,
            stickers: evidence.stickers.length,
            embeds: evidence.embeds.length,
          },
          "Skipping cache for text-only result — message has media evidence in metadata",
        );
        continue;
      }
    }

    const cacheKey = makeTextModerationCacheKey(rawContent);
    setCachedTextModeration(cacheKey, {
      flags: result.flags ?? [],
      score: result.score ?? 0,
      analysis: result.analysis ?? "",
      categories: result.categories ?? result.flags ?? [],
      severity: result.severity ?? "none",
      confidence: result.confidence ?? result.score ?? 0,
      recommendedAction: result.recommendedAction ?? "none",
      status: result.status,
    }).catch(() => {});
  }

  // ── Merge cache hits + new results ──
  const allResults = [
    ...cacheHits,
    ...textResults,
    ...mediaBatchResult.results,
  ];

  const raw = textBatchResult.raw ?? mediaBatchResult.raw;

  log.debug(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      cacheHits: cacheHits.length,
      textBatchResults: textResults.length,
      mediaResults: mediaBatchResult.results.length,
    },
    "Moderation analysis complete",
  );

  return { results: allResults, raw };
}

// ---------------------------------------------------------------------------
// Simple text-only fallback — uses a MINIMAL prompt that returns a single
// word ("clean", "warn", or "flagged") instead of a complex JSON object.
//
// This is designed for cheap/small models that struggle with:
//   1. Multi-target JSON output (confusing message_ids)
//   2. Complex JSON schema compliance (9+ fields)
//
// Trade-off: less detail (no flags/evidence/categories), but ZERO parse
// errors and much faster.  Field values are derived heuristically.
// ---------------------------------------------------------------------------

/**
 * Simple two-step text fallback for cheap/small models.
 *
 * Step 1: Ask the LLM for a single-word classification (clean/warn/flagged).
 * Step 2: If not clean, ask the LLM again for a real reason — no dummy text.
 *
 * NO JSON at either step.  Just raw text that we parse by simple rules.
 */
export async function runSimpleTextFallback(
  message: MessageRecord,
): Promise<AnalysisResult> {
  const content = getAnalysisContent(message);
  const MAX_CONTENT_CHARS = 500;
  const truncatedContent =
    content.length > MAX_CONTENT_CHARS
      ? content.slice(0, MAX_CONTENT_CHARS) + "..."
      : content;

  // ── Inject user profile for personality-aware fallback ──
  let userProfileCtx = "";
  try {
    const profile = await getUserProfile(message.user_id);
    if (profile?.profile_summary) {
      userProfileCtx = `\n\nProfil pengirim pesan:\n${sanitizeAiContent(profile.profile_summary, 2000, false)}\n`;
    }
  } catch {
    // Profile fetch failure is non-fatal — proceed without context
  }

  // ── Step 1: Single-word classification ──
  const classifyPrompt = `Pesan berikut perlu diklasifikasikan sebagai: clean, warn, atau flagged.

Aturan:
- clean: pesan biasa, percakapan normal, tidak ada pelanggaran
- warn: spam ringan, promosi tidak jelas, atau pelanggaran ringan
- flagged: harassment, SARA, NSFW, judi, ancaman, atau pelanggaran serius

PENTING (False Positive Prevention):
- Slang Indonesia ("anjay", "wkwk", "njir", "gws", dll) dan makian umum ("asu", "anjing", "bangsat") yang TIDAK ditujukan ke orang lain = clean.
- Konten coding/programming (kode, log error, SQL, command line, error message, stack trace, nama library) = clean. JANGAN flag hanya karena ada kata "error" atau "crash" dalam konteks teknis.
- Nama proyek, tools, framework (IMPHNEN, Bete, Cursor, Claude, React, Discord) = clean.
- Percakapan multilingual (campuran Indonesia-Inggris) = clean.
${userProfileCtx}
Pesan: "${truncatedContent}"

Jawab HANYA dengan satu kata: clean, warn, atau flagged`;

  let status: "clean" | "warn" | "flagged";
  let rawClassify = "";

  try {
    const completion = await llmChat({
      messages: [{ role: "user", content: classifyPrompt }],
      max_tokens: 10,
      temperature: 0.1,
    });

    rawClassify =
      completion?.choices[0]?.message?.content?.trim().toLowerCase() ?? "";

    if (rawClassify.includes("flagged")) {
      status = "flagged";
    } else if (rawClassify.includes("warn")) {
      status = "warn";
    } else {
      status = "clean";
    }

    log.info(
      { messageId: message.id, status, raw: rawClassify },
      "Simple fallback step 1 — classification",
    );
  } catch (error) {
    log.warn(
      {
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      },
      "Simple fallback step 1 failed — defaulting to clean",
    );
    status = "clean";
  }

  // ── Step 2: Real analysis text + category (only if not clean) ──
  // We ask the LLM for a real reason and a category word — no complex JSON.
  let analysis: string;
  let category = "";

  if (status === "clean") {
    analysis = `${message.username ?? "user"}: ${content.length > 200 ? content.slice(0, 200) + "..." : content}. Percakapan normal, tidak ada pelanggaran.`;
  } else {
    category = status === "flagged" ? "harassment" : "spam"; // default fallback
    const categoryOptions =
      status === "flagged" ? "harassment, gambling, atau sara" : "spam";
    const reasonPrompt = `Pesan berikut telah diklasifikasikan sebagai "${status}".
${userProfileCtx}
Pesan: "${truncatedContent}"

Jelaskan dalam 1-2 kalimat Bahasa Indonesia: APA yang melanggar dan KENAPA. Jangan gunakan kata "mungkin" atau "sepertinya". Jangan tulis ulang pesan. Langsung ke alasan.

Setelah alasan, sebutkan Kategori: ${categoryOptions}

Contoh untuk "flagged":
Mengandung kata kasar terarah ke individu tertentu sebagai hinaan.
Kategori: harassment

Contoh untuk "flagged":
Promosi situs judi online dengan link dan ajakan.
Kategori: gambling

Contoh untuk "warn":
Promosi channel Discord tanpa konteks, berpotensi spam.
Kategori: spam

Contoh untuk "warn":
Bahasa kasar ringan yang tidak terarah.
Kategori: spam`;

    try {
      const completion = await llmChat({
        messages: [{ role: "user", content: reasonPrompt }],
        max_tokens: 80,
        temperature: 0.3,
      });

      analysis = completion?.choices[0]?.message?.content?.trim() ?? "";

      // Guard against empty or non-answers
      if (!analysis || analysis.length < 5) {
        analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis.`;
      }

      // ── Parse category from "Kategori: xxx" line ──
      const categoryMatch = analysis.match(/[Kk]ategori:\s*(\w+)/i);
      if (categoryMatch) {
        const parsedCat = categoryMatch[1].toLowerCase();
        // Only accept known categories
        if (["harassment", "spam", "gambling", "sara"].includes(parsedCat)) {
          category = parsedCat;
        }
        // Strip the "Kategori:" line from the analysis text so it's cleaner
        analysis = analysis.replace(/[Kk]ategori:\s*\w+\s*/i, "").trim();
      }

      log.info(
        {
          messageId: message.id,
          status,
          category,
          analysis: analysis.slice(0, 100),
        },
        "Simple fallback step 2 — reason + category",
      );
    } catch (error) {
      analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis berdasarkan analisis konten.`;
      log.warn(
        {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Simple fallback step 2 failed — using fallback reason text",
      );
    }
  }

  // Build the result fields using parsed category
  const flags: string[] = status === "clean" ? [] : [category];
  const categories: string[] = status === "clean" ? [] : [category];
  const score = status === "flagged" ? 0.7 : status === "warn" ? 0.4 : 0;
  const severity: "none" | "low" | "medium" | "high" | "critical" =
    status === "flagged" ? "medium" : status === "warn" ? "low" : "none";
  const confidence = 0.6;

  return {
    messageId: message.id,
    status,
    flags,
    score,
    analysis,
    categories,
    severity,
    confidence,
    recommendedAction:
      status === "flagged" ? "review" : status === "warn" ? "warn" : "none",
    policyVersion: "default-simple-2026-06",
    evidence:
      status !== "clean"
        ? [content.length > 120 ? content.slice(0, 120) + "..." : content]
        : [],
  };
}

// ---------------------------------------------------------------------------
// Refactored helpers for prepareMediaMessage (extracted to reduce CC)
// ---------------------------------------------------------------------------

async function downloadSingleAttachment(
  att: AttachmentRecord,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
): Promise<void> {
  const urlToUse = att.uploaded_url ?? att.discord_url ?? null;
  if (!urlToUse) {
    log.warn(
      { attachmentId: att.id, messageId: att.message_id },
      "Skipping attachment: no uploaded URL available",
    );
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(urlToUse, { signal: controller.signal });
    if (!res.ok || !res.body) {
      log.warn(
        { attachmentId: att.id, url: urlToUse, status: res.status },
        "Failed to download attachment: HTTP error or no body",
      );
      return;
    }

    let totalBytes = 0;
    const chunks: Uint8Array[] = [];
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > 10 * 1024 * 1024) {
          log.warn(
            { attachmentId: att.id, totalBytes },
            "Attachment too large (>10MB) — skipping",
          );
          reader.cancel();
          return;
        }
        chunks.push(value);
      }
    }

    const imageBytes = Buffer.concat(chunks);
    const sniffedMime = sniffImageMimeType(imageBytes);
    if (!sniffedMime && att.type.startsWith("video/")) {
      // ── Video frame extraction via ffmpeg ──
      const execFileAsync = promisify(execFile);
      const tmpDir = await mkdtemp(path.join(tmpdir(), "bete-video-"));
      const inputPath = path.join(tmpDir, att.filename || "video.mp4");
      const outputPattern = path.join(tmpDir, "frame-%03d.jpg");
      try {
        await writeFile(inputPath, imageBytes);
        // Get video duration via ffprobe, then extract 4 evenly-spaced frames
        const { stdout: durationStr } = await execFileAsync("/usr/bin/ffprobe", [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "csv=p=0",
          inputPath,
        ], { timeout: 10000 });
        const duration = parseFloat(durationStr.trim()) || 1;
        // fps = 3/duration gives exactly 4 frames at 0, dur/3, 2*dur/3, dur
        const fps = (3 / duration).toFixed(6);
        await execFileAsync("/usr/bin/ffmpeg", [
          "-i", inputPath,
          "-vf", `fps=${fps}`,
          "-frames:v", "4",
          "-vsync", "vfr",
          "-q:v", "2",
          outputPattern,
        ], { timeout: 30000 });

        // Read extracted frames and add to imageMap
        for (let i = 1; i <= 4; i++) {
          const framePath = path.join(tmpDir, `frame-${String(i).padStart(3, "0")}.jpg`);
          try {
            const frameBytes = await readFile(framePath);
            const { data: resizedBuffer, mimeType: resizedMime } =
              await resizeImageForVision(frameBytes, maxDimension);
            const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
            const part: MessageImagePart = {
              type: "image_url",
              image_url: { url: dataUrl },
              sourceLabel: `[frame ${i}/4 dari video ${att.filename} (attachment), pesan id=${att.message_id}]`,
            };
            addImageToMap(imageMap, targetId, part);
          } catch {
            // Frame may not exist if video is short; skip silently
          }
        }
        log.info({ attachmentId: att.id, frameCount: 4 }, "Extracted video frames for vision analysis");
      } catch (ffmpegErr) {
        log.warn(
          { attachmentId: att.id, error: ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr) },
          "Failed to extract video frames with ffmpeg — skipping video",
        );
      } finally {
        // Cleanup temp files
        try { await unlink(inputPath); } catch { /* ignore */ }
        for (let i = 1; i <= 4; i++) {
          try { await unlink(path.join(tmpDir, `frame-${String(i).padStart(3, "0")}.jpg`)); } catch { /* ignore */ }
        }
        try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      return;
    }

    if (!sniffedMime) {
      log.warn(
        { attachmentId: att.id },
        "Skipping attachment: not a recognised image format",
      );
      return;
    }
    const { data: resizedBuffer, mimeType: resizedMime } =
      await resizeImageForVision(imageBytes, maxDimension);

    const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
    const part: MessageImagePart = {
      type: "image_url",
      image_url: { url: dataUrl },
      sourceLabel: `[gambar di atas adalah attachment ${att.filename} dari pesan id=${att.message_id}]`,
    };
    addImageToMap(imageMap, targetId, part);
  } catch (err) {
    log.warn(
      {
        attachmentId: att.id,
        error: err instanceof Error ? err.message : String(err),
      },
      "Error downloading attachment",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadMediaCandidate(
  candidate: MediaCandidate,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
  mediaAnalysisMap: Map<string, string[]>,
): Promise<void> {
  if ((imageMap.get(targetId)?.length ?? 0) >= 8) return;

  if (candidate.customEmojiId || candidate.stickerName) {
    const visionCacheKey = candidate.customEmojiId
      ? makeCustomEmojiCacheKey(candidate.customEmojiId)
      : makeStickerCacheKey(candidate.stickerName!);
    const cachedVision = await getCachedMediaAnalysis(visionCacheKey);
    if (cachedVision) {
      log.debug(
        { cacheKey: visionCacheKey },
        "Vision cache HIT for media candidate — skipped download",
      );
      const analysisText = `[Media analysis for message ${candidate.messageId}] ${candidate.label}: ${cachedVision}`;
      const existing = mediaAnalysisMap.get(targetId) ?? [];
      existing.push(analysisText);
      mediaAnalysisMap.set(targetId, existing);
      return;
    }
  }

  if (candidate.stickerName && isStickerCacheReady()) {
    try {
      const cached = await getStickerFromCache(candidate.stickerName);
      if (cached && cached.imageUrl) {
        const part: MessageImagePart = {
          type: "image_url",
          image_url: { url: cached.imageUrl },
          sourceLabel: candidate.label,
          stickerName: candidate.stickerName,
        };
        addImageToMap(imageMap, targetId, part);
        return;
      }
    } catch (stickerErr) {
      log.warn(
        {
          stickerName: candidate.stickerName,
          error:
            stickerErr instanceof Error
              ? stickerErr.message
              : String(stickerErr),
        },
        "Sticker cache lookup failed — falling through to network fetch",
      );
    }
  }

  const result = await fetchUrlSafely(candidate.url);
  if (result.type !== "image" || !result.data || !result.mimeType) {
    log.warn(
      {
        url: candidate.url,
        resultType: result.type,
        resultHasData: !!result.data,
        messageId: candidate.messageId,
        label: candidate.stickerName
          ? `sticker:${candidate.stickerName}`
          : candidate.customEmojiName
            ? `emoji:${candidate.customEmojiName}`
            : "embed/other",
      },
      "Media candidate fetch did not return a usable image — skipping",
    );
    return;
  }

  const { data: resizedBuffer, mimeType: resizedMime } =
    await resizeImageForVision(result.data, maxDimension);
  const base64 = resizedBuffer.toString("base64");

  if (candidate.stickerName) {
    uploadAndCacheSticker(
      candidate.stickerName,
      resizedBuffer,
      resizedMime,
    ).catch(() => {});
  }

  const part: MessageImagePart = {
    type: "image_url",
    image_url: { url: `data:${resizedMime};base64,${base64}` },
    sourceLabel: candidate.label,
    stickerName: candidate.stickerName,
    customEmojiId: candidate.customEmojiId,
    customEmojiName: candidate.customEmojiName,
  };
  addImageToMap(imageMap, targetId, part);
}

async function fetchUrlInline(
  url: string,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
  urlWebTexts: string[],
): Promise<void> {
  const result = await fetchUrlSafely(url);
  if (result.type === "image" && result.data && result.mimeType) {
    const { data: resizedBuffer, mimeType: resizedMime } =
      await resizeImageForVision(result.data, maxDimension);

    const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
    const part: MessageImagePart = {
      type: "image_url",
      image_url: { url: dataUrl },
      sourceLabel: `[gambar di atas berasal dari link ${url} pada pesan id=${targetId}]`,
    };
    addImageToMap(imageMap, targetId, part);
  } else if (result.type === "text" && result.textContent) {
    urlWebTexts.push(`[Isi Web dari ${url}]: ${result.textContent}`);
  }
}

function addImageToMap(
  imageMap: Map<string, MessageImagePart[]>,
  targetId: string,
  part: MessageImagePart,
): void {
  const existing = imageMap.get(targetId) ?? [];
  if (existing.length < 8) {
    existing.push(part);
    imageMap.set(targetId, existing);
  }
}

interface MediaCandidate {
  messageId: string;
  url: string;
  label: string;
  stickerName?: string;
  customEmojiId?: string;
  customEmojiName?: string;
}

function buildMediaCandidates(
  targetId: string,
  mediaEvidence: ReturnType<typeof extractMessageMediaEvidence>,
): MediaCandidate[] {
  return [
    ...mediaEvidence.stickers
      .filter((s) => s.url)
      .map(
        (s): MediaCandidate => ({
          messageId: targetId,
          url: s.url,
          label: `[gambar di atas adalah sticker "${s.name}" dari pesan id=${targetId}]`,
          stickerName: s.name,
        }),
      ),
    ...mediaEvidence.embeds.flatMap((embed): MediaCandidate[] =>
      [
        embed.image
          ? ({
              messageId: targetId,
              url: embed.image,
              label: `[gambar di atas berasal dari embed image pada pesan id=${targetId}]`,
            } as MediaCandidate)
          : null,
        embed.thumbnail
          ? ({
              messageId: targetId,
              url: embed.thumbnail,
              label: `[gambar di atas berasal dari embed thumbnail pada pesan id=${targetId}]`,
            } as MediaCandidate)
          : null,
      ].filter((c): c is MediaCandidate => c !== null),
    ),
    ...mediaEvidence.customEmojis.map(
      (emoji): MediaCandidate => ({
        messageId: targetId,
        url: emoji.url,
        label: `[gambar di atas adalah custom emoji "${emoji.name}" dari pesan id=${targetId}]`,
        customEmojiId: emoji.id,
        customEmojiName: emoji.name,
      }),
    ),
  ];
}

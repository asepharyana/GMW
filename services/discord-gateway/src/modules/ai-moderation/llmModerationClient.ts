import { createChildLogger } from "@bete/shared/logger";
import { delay, retryWithBackoff } from "@bete/shared/utils";
import { LRUCache } from "lru-cache";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { AbortError } from "p-retry";
import { z } from "zod";
import { config } from "../../shared/config/config.js";
import { resizeImageForVision } from "../attachment-upload/imageResizer.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { formatModerationTextEvidenceForPrompt } from "./indonesianTextNormalizer.js";
import { llmChat, llmVision } from "./llmClient.js";
import { buildSystemPrompt as buildSystemPromptModular } from "./moderationPrompt.js";
import { logModerationAnalysis, logModerationError } from "./responseLogger.js";
import {
  getStickerFromCache,
  initStickerCache,
  isStickerCacheReady,
  setStickerInCache,
} from "./stickerCache.js";
import {
  buildCustomEmojiVisionPrompt,
  buildGeneralImageVisionPrompt,
  buildStickerTextOnlyWarning,
  buildStickerVisionPrompt,
} from "./stickerPrompt.js";
import {
  computeImagePhash,
  getCachedMediaAnalysis,
  getCachedMediaByPhash,
  getRecentCorrectedModerations,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
  upsertCachedMediaByPhash,
} from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import {
  getCachedUserModeration,
  makeUserModerationCacheKey,
  setCachedUserModeration,
} from "./textCacheStore.js";

const SeveritySchema = z.enum(["none", "low", "medium", "high", "critical"]);
const RecommendedActionSchema = z.enum([
  "none",
  "monitor",
  "warn",
  "review",
  "delete",
  "escalate",
]);

const ResultItemSchema = z.object({
  message_id: z.union([z.string(), z.number()]).transform(String),
  status: z.enum(["clean", "warn", "flagged"]),
  flags: z.array(z.string()).optional(),
  score: z.number(),
  analysis: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  severity: SeveritySchema.optional(),
  confidence: z.number().optional(),
  recommended_action: RecommendedActionSchema.optional(),
  policy_version: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

const ModerationResponseSchema = z.object({
  results: z.array(ResultItemSchema),
});

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

/**
 * Enhanced deferral detection pattern (R9).
 *
 * Only matches patterns where the model explicitly states it cannot make
 * a decision and needs human review. Removed overly broad patterns that
 * caused false positives:
 * - "admin (perlu|harus|sebaiknya)" → common in regular sentences
 * - "bisa (berpotensi|mengandung)" → decisive statements, not deferral
 * - "maaf|sorry" → opinions/apologies, not deferral
 * - "saya tidak yakin|tahu|paham" → expressing uncertainty, not deferral
 */
const DEFERRAL_ANALYSIS_PATTERN =
  /(?:kurang (?:konteks|bukti|informasi|data) (?:untuk (?:menilai|menentukan|memutuskan)|untuk moderasi)|perlu (?:dicek|diperiksa|ditinjau|dikaji|dievaluasi) (?:oleh )?(?:admin|moderator|manusia|human review)|tidak (?:bisa|dapat|mampu) (?:menentukan|menilai|memastikan|menyimpulkan|memberi keputusan|memoderasi).*(?:karena (?:konteks tidak jelas|informasi tidak cukup|bukti kurang|konteks kurang|tidak cukup konteks)|data tidak cukup|informasi tidak lengkap)|cannot determine|insufficient (?:context|evidence|information) (?:to |for )?(?:moderate|judge|evaluate|decide|classify)|(?:sepertinya|tampaknya) (?:perlu|harus) (?:ditinjau|diperiksa|dicek) (?:oleh )?(?:admin|moderator)|tidak cukup (?:bukti|informasi|konteks) (?:untuk (?:memberikan|membuat|menentukan)|memutuskan))/i;

/**
 * Exceptions: patterns that look like deferral but are actually decisive.
 * Expanded to catch more variations where the model gives a clear verdict.
 */
const DEFERRAL_EXCEPTION_PATTERN =
  /tidak bisa menentukan.*(?:karena|sebab|dengan alasan|sebab tidak ada).*(?:clean|tidak (?:ada|terdapat|menunjukkan).*(?:pelanggaran|masalah|indikasi|konten)|aman|bersih|normal)/i;

function hasDeferralAnalysis(analysis: string): boolean {
  if (DEFERRAL_EXCEPTION_PATTERN.test(analysis)) return false;
  return DEFERRAL_ANALYSIS_PATTERN.test(analysis);
}

function clampScore(value: number | undefined, fallback = 0): number {
  return Math.max(
    0,
    Math.min(1, Number.isFinite(value) ? (value as number) : fallback),
  );
}

function deriveSeverity(
  status: "clean" | "warn" | "flagged",
  score: number,
): z.infer<typeof SeveritySchema> {
  if (status === "clean") return "none";
  if (status === "warn") return score >= 0.65 ? "medium" : "low";
  if (score >= 0.9) return "critical";
  return score >= 0.75 ? "high" : "medium";
}

function deriveRecommendedAction(
  status: "clean" | "warn" | "flagged",
  severity: z.infer<typeof SeveritySchema>,
): z.infer<typeof RecommendedActionSchema> {
  if (status === "clean") return "none";
  if (status === "warn") return severity === "medium" ? "review" : "warn";
  if (severity === "critical") return "escalate";
  if (severity === "high") return "delete";
  return "review";
}

/**
 * Helper to extract JSON from a potentially conversational or markdown-wrapped string.
 */
export function extractJson(content: string): any {
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const matches = content.matchAll(codeBlockRegex);
  for (const match of matches) {
    const codeContent = match[1].trim();
    try {
      const parsed = JSON.parse(codeContent);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (_) {}
  }

  for (let start = 0; start < content.length; start++) {
    const firstChar = content[start];
    if (firstChar !== "{" && firstChar !== "[") continue;

    const stack = [firstChar];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < content.length; i++) {
      const char = content[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }

      const last = stack[stack.length - 1];
      if ((char === "}" && last === "{") || (char === "]" && last === "[")) {
        stack.pop();
        if (stack.length === 0) {
          const candidate = content.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          } catch (_) {}
          break;
        }
      }
    }
  }

  throw new Error("No JSON object found in response");
}

/**
 * Sanitize error messages for client-facing output (R10).
 * Internal details are logged but the caller gets a generic message.
 */
function sanitizeErrorMessage(internalMsg: string, messageId: string): string {
  // Log the full error for debugging
  log.warn(
    { messageId, internalError: internalMsg },
    "Internal moderation error (sanitized for client)",
  );
  // Return generic message without internal details
  return `Analisis gagal dan memerlukan pemeriksaan manual. Error code: MOD_${Date.now().toString(36).slice(0, 6)}`;
}

export function parseModerationResponse(
  content: string,
  targetIds: string[],
): AnalysisResult[] {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parsed = extractJson(content);
  }

  if (Array.isArray(parsed)) {
    parsed = { results: parsed };
  } else if (parsed && typeof parsed === "object" && !("results" in parsed)) {
    if ("message_id" in parsed) {
      parsed = { results: [parsed] };
    } else {
      const arrayKey = Object.keys(parsed).find((key) => {
        const val = (parsed as any)[key];
        return (
          Array.isArray(val) &&
          val.length > 0 &&
          val.every(
            (item: unknown) =>
              typeof item === "object" &&
              item !== null &&
              "message_id" in (item as any),
          )
        );
      });
      if (arrayKey) {
        parsed.results = (parsed as any)[arrayKey];
      } else {
        parsed = { results: [parsed] };
      }
    }
  }

  const parseResult = ModerationResponseSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new Error(`Zod validation failed: ${parseResult.error.message}`);
  }

  const response = parseResult.data;
  const foundIds = new Set<string>();
  const targetIdSet = new Set(targetIds);

  const results: (AnalysisResult | null)[] = response.results.map((result) => {
    const {
      message_id,
      status,
      flags,
      score,
      analysis,
      categories,
      severity,
      confidence,
      recommended_action,
      policy_version,
      evidence,
    } = result;
    const finalId = message_id.trim();

    if (!targetIdSet.has(finalId)) {
      return null;
    }

    if (foundIds.has(finalId)) {
      throw new Error(
        `Duplicate message_id in moderation response: ${finalId}`,
      );
    }

    foundIds.add(finalId);

    const coalescedAnalysis = analysis ?? "";

    if (hasDeferralAnalysis(coalescedAnalysis)) {
      throw new Error(
        `Deferral analysis is not allowed for message ${finalId}; return a direct moderation decision`,
      );
    }

    const normalizedScore = clampScore(score);
    const normalizedConfidence = clampScore(confidence, normalizedScore);
    const normalizedSeverity =
      severity ?? deriveSeverity(status, normalizedScore);

    return {
      messageId: finalId,
      status: status as "clean" | "warn" | "flagged",
      flags: flags ?? [],
      score: normalizedScore,
      analysis: coalescedAnalysis,
      categories: categories ?? flags ?? [],
      severity: normalizedSeverity,
      confidence: normalizedConfidence,
      recommendedAction:
        recommended_action ??
        deriveRecommendedAction(status, normalizedSeverity),
      policyVersion: policy_version ?? "default-2026-05-30",
      evidence: evidence ?? [],
    };
  });

  const filteredResults = results.filter(
    (r): r is AnalysisResult => r !== null,
  );

  const missingIds = targetIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    log.warn(
      { missingIds, foundCount: foundIds.size, totalCount: targetIds.length },
      "Some target IDs missing in response - marking as incomplete",
    );
    for (const missingId of missingIds) {
      filteredResults.push({
        messageId: missingId,
        status: "error",
        flags: ["analysis_incomplete"],
        score: 0,
        analysis: sanitizeErrorMessage(
          "Analysis incomplete - LLM did not process this message",
          missingId,
        ),
        categories: ["analysis_incomplete"],
        severity: "none",
        confidence: 0,
        recommendedAction: "review",
        policyVersion: "default-2026-05-30",
        evidence: [],
      });
    }
  }

  return filteredResults;
}

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
 * Sniff the first bytes of a buffer to determine if it is a supported image
 * format. Returns the canonical MIME type string on success, or null if the
 * bytes are not a recognizable image.
 */
function sniffImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image/gif";
  }

  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    buf.length >= 12 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("avif") || brand.startsWith("avis")) {
      return "image/avif";
    }
    if (
      brand.startsWith("mif1") ||
      brand.startsWith("heic") ||
      brand.startsWith("heis")
    ) {
      return "image/heic";
    }
  }

  return null;
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

// ---------------------------------------------------------------------------
// Media detection helper
// ---------------------------------------------------------------------------

function hasMediaContent(
  target: MessageRecord,
  attachments?: AttachmentRecord[],
): boolean {
  if (target.metadata) {
    const evidence = extractMessageMediaEvidence(target.metadata);
    if (evidence.stickers.length > 0 || evidence.embeds.length > 0) return true;
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
            1_000 * 2 ** attempt + Math.random() * 200,
            8_000,
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
          // 429/401/403 → abort immediately, never retry
          if (
            apiError?.status === 429 ||
            apiError?.status === 401 ||
            apiError?.status === 403
          ) {
            throw new AbortError(apiError);
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
        retries: 2,
        minTimeout: 3000,
        maxTimeout: 8000,
        factor: 2,
      },
    );
    parsed = analysis.parsed;
    result = analysis.result;
  } catch (err) {
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

  // Pre-compute text evidence (normalization + badword detection)
  const textEvidenceMap = new Map<string, string>();
  await Promise.all(
    targets.map(async (msg) => {
      const content = msg.edited_content ?? msg.content;
      const evidence = await formatModerationTextEvidenceForPrompt(content);
      textEvidenceMap.set(msg.id, evidence);
    }),
  );

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
        shortContentGroups.get(groupKey)!.push(msg);
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

  // Run sub-batches sequentially to avoid rate limits
  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

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
      });

      const messagesBlock = batch
        .map((msg) => {
          const content = getAnalysisContent(msg);
          const textEvidence = textEvidenceMap.get(msg.id) ?? "";
          const textContext = textEvidence ? `\n${textEvidence}` : "";

          // Inject fetched web content for URLs found in this message
          const msgUrls = extractUrlsFromText(content);
          const urlContexts = msgUrls
            .map((url) => {
              const fetchedText = urlFetchMap.get(url);
              if (!fetchedText) return null;
              return `<web_content url="${url}">${fetchedText}</web_content>`;
            })
            .filter(Boolean)
            .join("\n");
          const webContext = urlContexts ? `\n${urlContexts}` : "";

          // XML delimiters wrap each message for prompt safety (R1)
          return `<message id="${msg.id}" user="${msg.username}">${content}${textContext}${webContext}</message>`;
        })
        .join("\n");

      // XML delimiter wraps the entire messages block (R1)
      return `${systemText}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;
    };

    const batchResult = (await Promise.race([
      callModerationLLM(buildContent, targetIds, `text-batch-${i + 1}`),
      new Promise<{ results: AnalysisResult[]; raw: unknown }>((_, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                `Text-only batch sub-batch ${i + 1} timed out for messages ${targetIds.join(", ")}`,
              ),
            ),
          timeoutMs,
        );
        timeout.unref();
      }),
    ])) as { results: AnalysisResult[]; raw: unknown };

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
// Single media message analysis — one LLM call per message with vision + timeout (R4, R5)
// ---------------------------------------------------------------------------

/**
 * Process a single media-bearing message:
 * 1. Download attachment images (resized via sharp — R5)
 * 2. Fetch URLs found in the message body
 * 3. Download sticker/embed images (resized via sharp — R5)
 * 4. Run vision analysis on every image (with DB + sticker cache)
 * 5. Build a single-message prompt with XML delimiters (R1)
 * 6. One LLM call → single AnalysisResult
 *
 * Wrapped with overall timeout (R4).
 */
async function runSingleMediaAnalysis(
  target: MessageRecord,
  contextText: string,
  allAttachments: AttachmentRecord[] | undefined,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  const targetId = target.id;
  const targetIds = [targetId];

  // Timeout wrapper (R4)
  const timeoutMs = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;

  return Promise.race([
    _runSingleMediaAnalysis(
      target,
      contextText,
      allAttachments,
      targetId,
      targetIds,
    ),
    new Promise<{ results: AnalysisResult[]; raw: unknown }>((_, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Media analysis timed out after ${timeoutMs}ms for message ${targetId}`,
            ),
          ),
        timeoutMs,
      );
      timeout.unref();
    }),
  ]);
}

async function _runSingleMediaAnalysis(
  target: MessageRecord,
  contextText: string,
  allAttachments: AttachmentRecord[] | undefined,
  targetId: string,
  targetIds: string[],
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  // Lazy init sticker cache
  if (!isStickerCacheReady()) {
    await initStickerCache().catch((err: unknown) => {
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Sticker cache init failed — continuing without cache",
      );
    });
  }

  // ── State maps for this single message ──
  const imageMap = new Map<string, MessageImagePart[]>();
  const webTextMap = new Map<string, string[]>();
  const mediaAnalysisMap = new Map<string, string[]>();

  const getAttachmentImageUrl = (att: AttachmentRecord): string | null =>
    att.uploaded_url ?? att.discord_url ?? null;

  const maxDimension = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;
  const content = getAnalysisContent(target);

  // ── 1-3. Parallel download of ALL media sources ──
  // Build all download promises upfront and execute them in one Promise.all.
  // Attachment, URL, sticker/emoji downloads are fully independent of each other.
  // An 8-image cap is enforced across all sources combined.

  const downloadPromises: Array<Promise<void>> = [];

  // ── Attachment downloads ──
  const msgAttachments = (allAttachments ?? [])
    .filter(
      (att) =>
        att.message_id === targetId &&
        getAttachmentImageUrl(att) &&
        att.type.startsWith("image/"),
    )
    .slice(0, 8);

  for (const att of msgAttachments) {
    downloadPromises.push(
      (async () => {
        const urlToUse = getAttachmentImageUrl(att);
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
          const existing = imageMap.get(targetId) ?? [];
          if (existing.length < 8) {
            existing.push(part);
            imageMap.set(targetId, existing);
          }
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
      })(),
    );
  }

  // ── URL fetch promises ──
  const urls = extractUrlsFromText(content).slice(0, 3);
  const urlWebTexts: string[] = [];

  for (const url of urls) {
    downloadPromises.push(
      (async () => {
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
          const existing = imageMap.get(targetId) ?? [];
          if (existing.length < 8) {
            existing.push(part);
            imageMap.set(targetId, existing);
          }
        } else if (result.type === "text" && result.textContent) {
          urlWebTexts.push(`[Isi Web dari ${url}]: ${result.textContent}`);
        }
      })(),
    );
  }

  // ── Sticker / embed / custom emoji download promises ──
  const mediaEvidence = extractMessageMediaEvidence(target.metadata);
  const mediaCandidates: Array<{
    messageId: string;
    url: string;
    label: string;
    stickerName?: string;
    customEmojiId?: string;
    customEmojiName?: string;
  }> = [
    ...mediaEvidence.stickers
      .filter((s) => s.url)
      .map((s) => ({
        messageId: targetId,
        url: s.url,
        label: `[gambar di atas adalah sticker "${s.name}" dari pesan id=${targetId}]`,
        stickerName: s.name,
      })),
    ...mediaEvidence.embeds.flatMap((embed) =>
      [
        embed.image
          ? {
              messageId: targetId,
              url: embed.image,
              label: `[gambar di atas berasal dari embed image pada pesan id=${targetId}]`,
            }
          : null,
        embed.thumbnail
          ? {
              messageId: targetId,
              url: embed.thumbnail,
              label: `[gambar di atas berasal dari embed thumbnail pada pesan id=${targetId}]`,
            }
          : null,
      ].filter(
        (
          c,
        ): c is {
          messageId: string;
          url: string;
          label: string;
          stickerName?: string;
          customEmojiId?: string;
          customEmojiName?: string;
        } => c !== null,
      ),
    ),
    ...mediaEvidence.customEmojis.map((emoji) => ({
      messageId: targetId,
      url: emoji.url,
      label: `[gambar di atas adalah custom emoji "${emoji.name}" dari pesan id=${targetId}]`,
      customEmojiId: emoji.id,
      customEmojiName: emoji.name,
    })),
  ];

  for (const candidate of mediaCandidates) {
    downloadPromises.push(
      (async () => {
        // Skip if we already have 8 images
        if ((imageMap.get(targetId)?.length ?? 0) >= 8) return;

        // Vision cache check before download (sticker & emoji keys only, since
        // their cache keys are consistent between check and store — embed URLs
        // use base64 data URL keys that never match the CDN URL).
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

        // Sticker download cache
        if (candidate.stickerName && isStickerCacheReady()) {
          try {
            const cached = await getStickerFromCache(candidate.stickerName);
            if (cached) {
              const part: MessageImagePart = {
                type: "image_url",
                image_url: {
                  url: `data:${cached.mimeType};base64,${cached.base64}`,
                },
                sourceLabel: candidate.label,
                stickerName: candidate.stickerName,
              };
              const existing = imageMap.get(targetId) ?? [];
              if (existing.length < 8) {
                existing.push(part);
                imageMap.set(targetId, existing);
              }
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
          setStickerInCache(candidate.stickerName, base64, resizedMime).catch(
            () => {},
          );
        }

        const part: MessageImagePart = {
          type: "image_url",
          image_url: { url: `data:${resizedMime};base64,${base64}` },
          sourceLabel: candidate.label,
          stickerName: candidate.stickerName,
          customEmojiId: candidate.customEmojiId,
          customEmojiName: candidate.customEmojiName,
        };
        const existing = imageMap.get(targetId) ?? [];
        if (existing.length < 8) {
          existing.push(part);
          imageMap.set(targetId, existing);
        }
      })(),
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
        // summary is never null — always returns either the analysis or a failure description
        const existing = mediaAnalysisMap.get(msgId) ?? [];
        existing.push(summary);
        mediaAnalysisMap.set(msgId, existing);
      }),
    ),
  );

  // ── 5. Build single-message prompt with XML delimiters (R1) ──
  const textEvidence = await formatModerationTextEvidenceForPrompt(content);

  const webTexts = webTextMap.get(targetId) ?? [];
  const mediaAnalyses = mediaAnalysisMap.get(targetId) ?? [];
  const webContext = webTexts.length > 0 ? `\n${webTexts.join("\n")}` : "";
  const textContext = textEvidence ? `\n${textEvidence}` : "";
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

  // XML delimiters wrap the message content (R1)
  const messageBlock = `<message id="${target.id}" user="${target.username}">${content}${mediaContext ? ` ${mediaContext}` : ""}${textContext}${webContext}${mediaAnalysisContext}</message>`;

  // Modular system prompt with XML delimiters (R1, R7, R8)
  const correctedExamples = await buildCorrectedFewShotExamples();
  const systemText = buildSystemPromptModular({
    contextText,
    mode: "mixed",
    correctedExamples,
  });

  const userContent = `${systemText}\n\n<messages_to_analyze>\n${messageBlock}\n</messages_to_analyze>`;

  // ── 6. LLM call ──
  const result = await callModerationLLM(
    async (_state: RetryState) => userContent,
    targetIds,
    `media:${targetId}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Main entry point — splits text-only vs media, runs both paths in parallel
// ---------------------------------------------------------------------------

/**
 * Runs LLM-based moderation analysis on messages.
 *
 * Architecture:
 * - **Text-only messages** → single batch LLM call (fast, no image processing)
 *   - Split into sub-batches if exceeding AI_LLM_TEXT_BATCH_SIZE (R6)
 * - **Media messages** → each gets its own LLM call with vision API (R5: resized images)
 * - Both paths execute **in parallel** — text batch does NOT wait for media.
 * - All LLM calls go through concurrency limiter (R3).
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

    const cacheKey = makeUserModerationCacheKey(target.user_id, rawContent);
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
      const cached = await getCachedUserModeration(cacheKey);
      if (cached) {
        cacheHits.push({
          messageId: target.id,
          status: cached.status,
          flags: cached.flags,
          score: cached.score,
          analysis: cached.analysis,
          categories: cached.categories,
          severity: cached.severity as AnalysisResult["severity"],
          confidence: cached.confidence,
          recommendedAction: cached.recommendedAction as AnalysisResult["recommendedAction"],
          policyVersion: "cached-user-moderation-2026-06",
          evidence: [],
        });
        log.debug(
          { messageId: target.id, userId: target.user_id, cacheKey },
          "User moderation cache HIT — reusing previous result",
        );
        continue;
      }
    } catch {
      // Cache lookup failed — proceed with uncached path
    }

    uncachedTargets.push(target);
  }

  if (cacheHits.length > 0) {
    log.info(
      { cacheHits: cacheHits.length, uncached: uncachedTargets.length, total: targets.length },
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
  const [textBatchResult, ...mediaResults] = await Promise.all([
    // Text-only: one fast batch call (or multiple sub-batches)
    textOnlyTargets.length > 0
      ? runTextOnlyBatch(textOnlyTargets, contextText)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),

    // Media: each message gets its own LLM call (all in parallel, but limited by semaphore — R3)
    ...mediaTargets.map((target) =>
      runSingleMediaAnalysis(target, contextText, attachments),
    ),
  ]);

  // ── Store uncached text-only results in cache ──
  const textResults = textBatchResult.results;
  for (const result of textResults) {
    const target = textOnlyTargets.find((t) => t.id === result.messageId);
    if (!target) continue;

    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) continue;

    const cacheKey = makeUserModerationCacheKey(target.user_id, rawContent);
    setCachedUserModeration(cacheKey, {
      flags: result.flags ?? [],
      score: result.score ?? 0,
      analysis: result.analysis ?? "",
      categories: result.categories ?? result.flags ?? [],
      severity: result.severity ?? "none",
      confidence: result.confidence ?? result.score ?? 0,
      recommendedAction: result.recommendedAction ?? "none",
      status: result.status === "error" ? "flagged" : result.status,
    }).catch(() => {});
  }

  // ── Merge cache hits + new results ──
  const allResults = [
    ...cacheHits,
    ...textResults,
    ...mediaResults.flatMap((r) => r.results),
  ];

  const raw =
    textBatchResult.raw ??
    (mediaResults.length > 0 ? mediaResults[0].raw : null);

  log.debug(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      cacheHits: cacheHits.length,
      textBatchResults: textResults.length,
      mediaResults: mediaResults.length,
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

  // ── Step 1: Single-word classification ──
  const classifyPrompt = `Pesan berikut perlu diklasifikasikan sebagai: clean, warn, atau flagged.

Aturan:
- clean: pesan biasa, percakapan normal, tidak ada pelanggaran
- warn: spam ringan, promosi tidak jelas, atau pelanggaran ringan
- flagged: harassment, SARA, NSFW, judi, ancaman, atau pelanggaran serius

PENTING: Slang Indonesia ("anjay", "wkwk", "njir", "gws", dll) dan makian umum ("asu", "anjing", "bangsat") yang TIDAK ditujukan ke orang lain = clean.

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
      const categoryMatch = analysis.match(
        /[Kk]ategori:\s*(\w+)/i,
      );
      if (categoryMatch) {
        const parsedCat = categoryMatch[1].toLowerCase();
        // Only accept known categories
        if (
          ["harassment", "spam", "gambling", "sara"].includes(parsedCat)
        ) {
          category = parsedCat;
        }
        // Strip the "Kategori:" line from the analysis text so it's cleaner
        analysis = analysis.replace(/[Kk]ategori:\s*\w+\s*/i, "").trim();
      }

      log.info(
        { messageId: message.id, status, category, analysis: analysis.slice(0, 100) },
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
  const flags: string[] =
    status === "clean" ? [] : [category];
  const categories: string[] =
    status === "clean" ? [] : [category];
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

import OpenAI from "openai";
import { AbortError } from "p-retry";
import { z } from "zod";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import { retryWithBackoff } from "../retry.js";
import { withLlmConcurrency } from "./concurrencyLimiter.js";
import { formatModerationTextEvidenceForPrompt } from "./indonesianTextNormalizer.js";
import { resizeImageForVision } from "./imageResizer.js";
import { extractMessageMediaEvidence } from "./messageMetadata.js";
import { buildSystemPrompt as buildSystemPromptModular } from "./moderationPrompt.js";
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
  getCachedMediaAnalysis,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
} from "./textCacheStore.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "./types.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";

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
 * JSON Schema for OpenAI's response_format: { type: "json_schema" }.
 * This enforces the exact structure the LLM must output (R2).
 */
const MODERATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          message_id: { type: "string" },
          status: { type: "string", enum: ["clean", "warn", "flagged"] },
          flags: { type: "array", items: { type: "string" } },
          score: { type: "number", minimum: 0, maximum: 1 },
          analysis: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          severity: {
            type: "string",
            enum: ["none", "low", "medium", "high", "critical"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          recommended_action: {
            type: "string",
            enum: ["none", "monitor", "warn", "review", "delete", "escalate"],
          },
          policy_version: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: [
          "message_id",
          "status",
          "flags",
          "score",
          "severity",
          "confidence",
          "recommended_action",
          "policy_version",
          "evidence",
          "analysis",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// OpenAI client with Cloudflare WAF bypass (unchanged)
// ---------------------------------------------------------------------------

const openai = new OpenAI({
  apiKey: config.AI_LLM_API_KEY,
  baseURL: config.AI_LLM_BASE_URL,
  maxRetries: 0,
  timeout: 30000,
  fetch: async (url, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers = new Headers(init?.headers);
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    for (const key of Array.from(headers.keys())) {
      if (key.toLowerCase().startsWith("x-stainless")) {
        headers.delete(key);
      }
    }

    const fetchInit = { ...init, headers, signal: controller.signal };

    try {
      const response = await globalThis.fetch(url, fetchInit);
      const body =
        typeof response.text === "function"
          ? await response.text()
          : JSON.stringify(await response.json());

      let normalizedBody = body;
      if (response.ok !== false) {
        try {
          JSON.parse(body);
        } catch (error) {
          log.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              status: response.status ?? 200,
              bodyLength: body.length,
              body,
            },
            "LLM provider returned malformed JSON response body",
          );
          normalizedBody = JSON.stringify(extractJson(body));
        }
      }

      const responseHeaders = new Headers(response.headers ?? undefined);
      responseHeaders.set("Content-Type", "application/json");
      responseHeaders.delete("Content-Length");

      return new Response(normalizedBody, {
        status: response.status ?? 200,
        headers: responseHeaders,
      });
    } finally {
      clearTimeout(timeout);
    }
  },
});

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

const analyzeSingleMediaImage = async (
  messageId: string,
  image: MessageImagePart,
): Promise<string | null> => {
  const cacheKey = image.customEmojiId
    ? makeCustomEmojiCacheKey(image.customEmojiId)
    : image.stickerName
      ? makeStickerCacheKey(image.stickerName)
      : makeImageCacheKey(image.image_url.url);

  const cached = await getCachedMediaAnalysis(cacheKey);
  if (cached) {
    log.debug({ cacheKey }, "Media analysis cache HIT");
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${cached}`;
  }

  const promptText = image.stickerName
    ? buildStickerVisionPrompt(image.stickerName, messageId)
    : image.customEmojiName
      ? buildCustomEmojiVisionPrompt(image.customEmojiName, messageId)
      : buildGeneralImageVisionPrompt(image.sourceLabel, messageId);

  try {
    const completion = await withLlmConcurrency(async () =>
      openai.chat.completions.create({
        model: config.AI_LLM_VISION_MODEL ?? config.AI_LLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: promptText,
              },
              { type: "image_url", image_url: image.image_url },
            ],
          },
        ],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 500,
        stream: false,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming),
    );

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;

    await upsertCachedMediaAnalysis(
      cacheKey,
      content,
      "vision_llm",
      Date.now() + 24 * 60 * 60 * 1000,
    );

    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${content}`;
  } catch (error) {
    log.warn(
      {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Separate media analysis failed",
    );
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: gagal dianalisis otomatis; gunakan metadata URL/nama media sebagai evidence.`;
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
  raw: OpenAI.Chat.Completions.ChatCompletion | null;
}> {
  const state: RetryState = {
    lastParseError: null,
    lastInvalidContent: null,
  };

  let parsed: AnalysisResult[];
  let result: OpenAI.Chat.Completions.ChatCompletion | null = null;

  try {
    const analysis = await retryWithBackoff(
      async () => {
        try {
          const content = await buildContent(state);

          const completion = await withLlmConcurrency(async () =>
            openai.chat.completions.create({
              model: config.AI_LLM_MODEL,
              messages: [{ role: "user", content }],
              temperature: 0.2,
              top_p: 0.95,
              // Reduced from 16384 — JSON Schema enforces structure (R2)
              max_tokens: 4096,
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "moderation_result",
                  schema: MODERATION_JSON_SCHEMA,
                  strict: true,
                },
              },
              stream: false,
            } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming),
          );

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
          if (
            apiError?.status === 429 ||
            apiError?.status === 401 ||
            apiError?.status === 403
          ) {
            throw new AbortError(apiError);
          }
          throw apiError;
        }
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 10000,
        logger: log,
      },
    );
    parsed = analysis.parsed;
    result = analysis.result;
  } catch (parseError) {
    if (!state.lastInvalidContent) {
      throw parseError;
    }

    const errorMsg =
      parseError instanceof Error ? parseError.message : String(parseError);

    log.error(
      {
        error: errorMsg,
        contentLength: state.lastInvalidContent.length,
        contentPreview: state.lastInvalidContent.substring(0, 500),
        targetIds,
        model: config.AI_LLM_MODEL,
        timestamp: new Date().toISOString(),
      },
      `Robust Fallback (${label}): Failed to parse moderation response. Marking all targets as analysis errors.`,
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

  // Pre-compute text evidence (normalization + badword detection)
  const textEvidenceMap = new Map<string, string>();
  await Promise.all(
    targets.map(async (msg) => {
      const content = msg.edited_content ?? msg.content;
      const evidence = await formatModerationTextEvidenceForPrompt(content);
      textEvidenceMap.set(msg.id, evidence);
    }),
  );

  // Split into sub-batches if needed (R6)
  const subBatches: MessageRecord[][] = [];
  for (let i = 0; i < targets.length; i += maxBatchSize) {
    subBatches.push(targets.slice(i, i + maxBatchSize));
  }

  if (subBatches.length > 1) {
    log.info(
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
      const systemText = buildSystemPromptModular({
        contextText,
        includeMediaInstructions: false,
        correction,
      });

      const messagesBlock = batch
        .map((msg) => {
          const content = msg.edited_content ?? msg.content;
          const textEvidence = textEvidenceMap.get(msg.id) ?? "";
          const textContext = textEvidence ? `\n${textEvidence}` : "";
          // XML delimiters wrap each message for prompt safety (R1)
          return `<message id="${msg.id}" user="${msg.username}">${content}${textContext}</message>`;
        })
        .join("\n");

      // XML delimiter wraps the entire messages block (R1)
      return `${systemText}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;
    };

    const batchResult = await callModerationLLM(
      buildContent,
      targetIds,
      `text-batch-${i + 1}`,
    );

    allResults.push(...batchResult.results);
    if (batchResult.raw) lastRaw = batchResult.raw;
  }

  log.info(
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
    await initStickerCache({
      cacheDir: config.STICKER_CACHE_DIR,
      maxSizeBytes: config.STICKER_CACHE_MAX_SIZE_MB * 1024 * 1024,
    }).catch((err) => {
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
    att.uploaded_url ?? null;

  const maxDimension = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;

  // ── 1. Download attachments for this message (with resize — R5) ──
  const msgAttachments = (allAttachments ?? [])
    .filter(
      (att) =>
        att.message_id === targetId &&
        getAttachmentImageUrl(att) &&
        att.type.startsWith("image/"),
    )
    .slice(0, 8);

  await Promise.all(
    msgAttachments.map(async (att) => {
      const urlToUse = getAttachmentImageUrl(att);
      if (!urlToUse) return;

      // Check vision cache BEFORE downloading
      const attVisionKey = makeImageCacheKey(urlToUse);
      const cachedVision = await getCachedMediaAnalysis(attVisionKey);
      if (cachedVision) {
        log.debug(
          { attachmentId: att.id, cacheKey: attVisionKey },
          "Vision cache HIT for attachment — skipped download",
        );
        const sourceLabel = `[gambar di atas adalah attachment ${att.filename} dari pesan id=${att.message_id}]`;
        const analysisText = `[Media analysis for message ${att.message_id}] ${sourceLabel}: ${cachedVision}`;
        const existing = mediaAnalysisMap.get(targetId) ?? [];
        existing.push(analysisText);
        mediaAnalysisMap.set(targetId, existing);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(urlToUse, { signal: controller.signal });
        if (!res.ok || !res.body) return;

        let totalBytes = 0;
        const chunks: Uint8Array[] = [];
        const reader = res.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length;
            if (totalBytes > 10 * 1024 * 1024) {
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

        // Resize before base64 encoding (R5)
        const { data: resizedBuffer, mimeType: resizedMime } =
          await resizeImageForVision(imageBytes, maxDimension);

        const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
        const part: MessageImagePart = {
          type: "image_url",
          image_url: { url: dataUrl },
          sourceLabel: `[gambar di atas adalah attachment ${att.filename} dari pesan id=${att.message_id}]`,
        };
        const existing = imageMap.get(targetId) ?? [];
        existing.push(part);
        imageMap.set(targetId, existing);
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
    }),
  );

  // ── 2. Fetch URLs found in message text ──
  const content = target.edited_content ?? target.content;
  const urls = extractUrlsFromText(content).slice(0, 3);

  if (urls.length > 0) {
    const webTexts: string[] = [];
    await Promise.all(
      urls.map(async (url) => {
        const result = await fetchUrlSafely(url);
        if (result.type === "image" && result.data && result.mimeType) {
          // Resize fetched images too (R5)
          const { data: resizedBuffer, mimeType: resizedMime } =
            await resizeImageForVision(result.data, maxDimension);

          const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
          const part: MessageImagePart = {
            type: "image_url",
            image_url: { url: dataUrl },
            sourceLabel: `[gambar di atas berasal dari link ${url} pada pesan id=${targetId}]`,
          };
          const existing = imageMap.get(targetId) ?? [];
          existing.push(part);
          imageMap.set(targetId, existing);
        } else if (result.type === "text" && result.textContent) {
          webTexts.push(`[Isi Web dari ${url}]: ${result.textContent}`);
        }
      }),
    );
    if (webTexts.length > 0) webTextMap.set(targetId, webTexts);
  }

  // ── 3. Sticker / embed / custom emoji images ──
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

  const remainingSlots = Math.max(0, 8 - (imageMap.get(targetId)?.length ?? 0));

  await Promise.all(
    mediaCandidates.slice(0, remainingSlots).map(async (candidate) => {
      // Vision cache check before download
      const visionCacheKey = candidate.customEmojiId
        ? makeCustomEmojiCacheKey(candidate.customEmojiId)
        : candidate.stickerName
          ? makeStickerCacheKey(candidate.stickerName)
          : makeImageCacheKey(candidate.url);
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
            existing.push(part);
            imageMap.set(targetId, existing);
            return;
          }
        } catch {
          // Fall through to fetch
        }
      }

      const result = await fetchUrlSafely(candidate.url);
      if (result.type !== "image" || !result.data || !result.mimeType) return;

      // Resize sticker/emoji images too (R5)
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
        image_url: {
          url: `data:${resizedMime};base64,${base64}`,
        },
        sourceLabel: candidate.label,
        stickerName: candidate.stickerName,
        customEmojiId: candidate.customEmojiId,
        customEmojiName: candidate.customEmojiName,
      };
      const existing = imageMap.get(targetId) ?? [];
      existing.push(part);
      imageMap.set(targetId, existing);
    }),
  );

  // ── 4. Vision analysis for every image ──
  await Promise.all(
    Array.from(imageMap.entries()).flatMap(([msgId, images]) =>
      images.map(async (image) => {
        const summary = await analyzeSingleMediaImage(msgId, image);
        if (!summary) return;
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
  const systemText = buildSystemPromptModular({
    contextText,
    includeMediaInstructions: true,
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

  // ── Split targets ──
  const textOnlyTargets: MessageRecord[] = [];
  const mediaTargets: MessageRecord[] = [];

  for (const target of targets) {
    if (hasMediaContent(target, attachments)) {
      mediaTargets.push(target);
    } else {
      textOnlyTargets.push(target);
    }
  }

  log.info(
    {
      total: targets.length,
      textOnly: textOnlyTargets.length,
      media: mediaTargets.length,
    },
    "Split targets for parallel moderation analysis",
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

  // ── Merge ──
  const allResults = [
    ...textBatchResult.results,
    ...mediaResults.flatMap((r) => r.results),
  ];

  const raw =
    textBatchResult.raw ??
    (mediaResults.length > 0 ? mediaResults[0].raw : null);

  log.info(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      textBatchResults: textBatchResult.results.length,
      mediaResults: mediaResults.length,
    },
    "Moderation analysis complete",
  );

  return { results: allResults, raw };
}

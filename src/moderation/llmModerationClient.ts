import OpenAI from "openai";
import { AbortError } from "p-retry";
import { z } from "zod";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import { retryWithBackoff } from "../retry.js";
import { formatModerationTextEvidenceForPrompt } from "./indonesianTextNormalizer.js";
import { extractMessageMediaEvidence } from "./messageMetadata.js";
import {
  getStickerFromCache,
  initStickerCache,
  isStickerCacheReady,
  setStickerInCache,
} from "./stickerCache.js";
import {
  buildStickerTextOnlyWarning,
  buildStickerVisionPrompt,
} from "./stickerPrompt.js";
import {
  getCachedMediaAnalysis,
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
const DEFERRAL_ANALYSIS_PATTERN =
  /kurang konteks|kekurangan konteks|perlu (dicek|diperiksa|ditinjau).*(admin|moderator)|admin perlu|moderator perlu|tidak bisa menentukan|tidak dapat menentukan|cannot determine|insufficient context/i;

function hasDeferralAnalysis(analysis: string): boolean {
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

const openai = new OpenAI({
  apiKey: config.AI_LLM_API_KEY,
  baseURL: config.AI_LLM_BASE_URL,
  maxRetries: 0,
  timeout: 30000,
  fetch: async (url, init) => {
    // Add internal timeout for the global fetch as safety
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    // Override headers to bypass Cloudflare WAF Bot Fight Mode
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

      const headers = new Headers(response.headers ?? undefined);
      headers.set("Content-Type", "application/json");
      headers.delete("Content-Length");

      return new Response(normalizedBody, {
        status: response.status ?? 200,
        headers,
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
    // If the object directly looks like a result item (has message_id), wrap it
    // BEFORE checking for array keys. This prevents flags:[] from being
    // mistaken as the results array on a single-object response.
    if ("message_id" in parsed) {
      parsed = { results: [parsed] };
    } else {
      // Find the first non-empty array key whose elements are objects with message_id
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
        analysis: "Analysis incomplete - LLM did not process this message",
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
 *
 * Supported probes (in order):
 *   - JPEG:  FF D8 FF
 *   - PNG:   89 50 4E 47 0D 0A 1A 0A
 *   - GIF:   47 49 46 38 (GIF8)
 *   - WebP:  52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
 *   - AVIF / HEIF: 4-byte big-endian size + 66 74 79 70 (ftyp ISO base-media box)
 */
function sniffImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG
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

  // GIF
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF????WEBP
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

  // AVIF / HEIF: ISO base media file format — ftyp box at offset 4
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

/**
 * Runs LLM-based moderation analysis on messages.
 * POSTs to AI_LLM_BASE_URL with auth bearer token.
 */
export async function runModerationAnalysis(
  input: ModerationInput,
): Promise<ModerationOutput> {
  const { targets, contextText, attachments } = input;

  if (!targets.length) {
    throw new Error("No targets provided for analysis");
  }

  // Lazy init sticker cache on first run
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

  const targetIds = targets.map((t) => t.id);

  // Build a lookup: message_id → list of resolved base64 image parts
  type MessageImagePart = {
    type: "image_url";
    image_url: { url: string };
    sourceLabel: string;
    stickerName?: string;
  };
  type MessageImageMap = Map<string, MessageImagePart[]>;

  // Resolve and download image attachments, grouped by message_id.
  // Only images whose message_id appears in the full attachment list are kept;
  // target messages get priority in the 8-image global cap.
  const getAttachmentImageUrl = (att: AttachmentRecord): string | null =>
    att.uploaded_url ?? null;

  const targetIdSet = new Set(targets.map((t) => t.id));

  const candidateAttachments = (attachments ?? [])
    .filter(
      (att) => getAttachmentImageUrl(att) && att.type.startsWith("image/"),
    )
    .sort((a, b) => {
      // Target-message attachments always come first so they consume the cap first
      const aIsTarget = targetIdSet.has(a.message_id) ? 1 : 0;
      const bIsTarget = targetIdSet.has(b.message_id) ? 1 : 0;
      if (aIsTarget !== bIsTarget) return bIsTarget - aIsTarget;
      // Within the same priority tier, newest first
      return b.created_at - a.created_at;
    })
    .slice(0, 8); // Hard cap — some vision APIs (Nemotron, Omni) reject >8 images

  const messageImageMap: MessageImageMap = new Map();

  await Promise.all(
    candidateAttachments.map(async (att) => {
      const urlToUse = getAttachmentImageUrl(att);
      if (!urlToUse) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        log.info(
          { attachmentId: att.id, messageId: att.message_id, url: urlToUse },
          "Downloading attachment for base64 encoding",
        );

        const res = await fetch(urlToUse, { signal: controller.signal });
        if (!res.ok) {
          log.warn(
            { attachmentId: att.id, status: res.status, url: urlToUse },
            "Failed to fetch attachment image — non-2xx status",
          );
          return;
        }

        if (!res.body) return;

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
                { attachmentId: att.id },
                "Attachment exceeded 10MB limit, aborting stream",
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
            {
              attachmentId: att.id,
              url: urlToUse,
              dbType: att.type,
              bytesLength: imageBytes.length,
              headerHex: imageBytes.subarray(0, 16).toString("hex"),
            },
            "Skipping attachment: downloaded bytes are not a recognised image format",
          );
          return;
        }

        const dataUrl = `data:${sniffedMime};base64,${imageBytes.toString("base64")}`;
        const part: MessageImagePart = {
          type: "image_url",
          image_url: { url: dataUrl },
          sourceLabel: `[gambar di atas adalah attachment ${att.filename} dari pesan id=${att.message_id}]`,
        };

        const existing = messageImageMap.get(att.message_id) ?? [];
        existing.push(part);
        messageImageMap.set(att.message_id, existing);
      } catch (err) {
        log.warn(
          {
            attachmentId: att.id,
            error: err instanceof Error ? err.message : String(err),
          },
          "Error base64 encoding attachment",
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }),
  );

  // --- Fetch URLs found in target messages ---
  // To avoid slowing down the pipeline too much, we limit to 3 URLs per message.
  const messageWebTextMap = new Map<string, string[]>();

  await Promise.all(
    targets.map(async (msg) => {
      const content = msg.edited_content ?? msg.content;
      const urls = extractUrlsFromText(content).slice(0, 3);
      if (urls.length === 0) return;

      const webTexts: string[] = [];

      await Promise.all(
        urls.map(async (url) => {
          const result = await fetchUrlSafely(url);

          if (result.type === "image" && result.data && result.mimeType) {
            // Append as an image part
            const dataUrl = `data:${result.mimeType};base64,${result.data.toString("base64")}`;
            const part: MessageImagePart = {
              type: "image_url",
              image_url: { url: dataUrl },
              sourceLabel: `[gambar di atas berasal dari link ${url} pada pesan id=${msg.id}]`,
            };
            const existing = messageImageMap.get(msg.id) ?? [];
            existing.push(part);
            messageImageMap.set(msg.id, existing);
          } else if (result.type === "text" && result.textContent) {
            webTexts.push(`[Isi Web dari ${url}]: ${result.textContent}`);
          } else if (result.type === "error") {
            log.debug(
              { url, error: result.error },
              "Failed to fetch URL for moderation context",
            );
          }
        }),
      );

      if (webTexts.length > 0) {
        messageWebTextMap.set(msg.id, webTexts);
      }
    }),
  );

  const mediaImageCandidates = targets.flatMap((msg) => {
    const evidence = extractMessageMediaEvidence(msg.metadata);
    return [
      ...evidence.stickers
        .filter((sticker) => sticker.url)
        .map((sticker) => ({
          messageId: msg.id,
          url: sticker.url,
          label: `[gambar di atas adalah sticker "${sticker.name}" dari pesan id=${msg.id}]`,
          stickerName: sticker.name,
        })),
      ...evidence.embeds.flatMap((embed) =>
        [
          embed.image
            ? {
                messageId: msg.id,
                url: embed.image,
                label: `[gambar di atas berasal dari embed image pada pesan id=${msg.id}]`,
              }
            : null,
          embed.thumbnail
            ? {
                messageId: msg.id,
                url: embed.thumbnail,
                label: `[gambar di atas berasal dari embed thumbnail pada pesan id=${msg.id}]`,
              }
            : null,
        ].filter(
          (
            candidate,
          ): candidate is {
            messageId: string;
            url: string;
            label: string;
            stickerName?: string;
          } => candidate !== null,
        ),
      ),
    ];
  });

  const remainingImageSlots = Math.max(
    0,
    8 -
      Array.from(messageImageMap.values()).reduce(
        (sum, imgs) => sum + imgs.length,
        0,
      ),
  );

  await Promise.all(
    mediaImageCandidates
      .slice(0, remainingImageSlots)
      .map(async (candidate) => {
        // --- Sticker cache check ---
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
              const existing = messageImageMap.get(candidate.messageId) ?? [];
              existing.push(part);
              messageImageMap.set(candidate.messageId, existing);
              log.debug(
                { stickerName: candidate.stickerName },
                "Sticker cache HIT — skipped fetch",
              );
              return;
            }
          } catch (err) {
            log.debug(
              {
                stickerName: candidate.stickerName,
                error: err instanceof Error ? err.message : String(err),
              },
              "Sticker cache read error — falling back to fetch",
            );
          }
        }

        // --- Cache miss or non-sticker: fetch normally ---
        const result = await fetchUrlSafely(candidate.url);
        if (result.type !== "image" || !result.data || !result.mimeType) return;

        const base64 = result.data.toString("base64");

        // Cache on success (sticker only)
        if (candidate.stickerName) {
          setStickerInCache(
            candidate.stickerName,
            base64,
            result.mimeType,
          ).catch((err) => {
            log.warn(
              { error: err instanceof Error ? err.message : String(err) },
              "Failed to cache sticker — continuing without cache",
            );
          });
        }

        const part: MessageImagePart = {
          type: "image_url",
          image_url: {
            url: `data:${result.mimeType};base64,${base64}`,
          },
          sourceLabel: candidate.label,
          stickerName: candidate.stickerName,
        };
        const existing = messageImageMap.get(candidate.messageId) ?? [];
        existing.push(part);
        messageImageMap.set(candidate.messageId, existing);
      }),
  );

  const analyzeSingleMediaImage = async (
    messageId: string,
    image: MessageImagePart,
  ): Promise<string | null> => {
    // ── Build deterministic cache key ──
    const cacheKey = image.stickerName
      ? makeStickerCacheKey(image.stickerName)
      : makeImageCacheKey(image.image_url.url);

    // ── Tier 1: DB cache lookup ──
    const cached = await getCachedMediaAnalysis(cacheKey);
    if (cached) {
      log.debug({ cacheKey }, "Media analysis cache HIT");
      return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${cached}`;
    }

    // ── Tier 2: Vision API call ──
    try {
      const completion = await openai.chat.completions.create({
        model: config.AI_LLM_VISION_MODEL ?? config.AI_LLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: image.stickerName
                  ? buildStickerVisionPrompt(image.stickerName, messageId)
                  : `Analisis media Discord berikut sebagai evidence moderasi. ${image.sourceLabel}\nJelaskan isi visual, teks yang terlihat, konteks risiko, dan apakah ada indikasi spam, scam, SARA, harassment, sexual content, violence, self-harm, doxxing, NSFW, gore, atau illegal content. Jawab Bahasa Indonesia, maksimal 3 kalimat. Jangan bilang kurang konteks atau perlu admin cek; berikan observasi langsung dari media.`,
              },
              { type: "image_url", image_url: image.image_url },
            ],
          },
        ],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 500,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
        reasoning_budget: 0,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) return null;

      // ── Cache the result (24h TTL, strips messageId wrapper) ──
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

  const messageMediaAnalysisMap = new Map<string, string[]>();
  await Promise.all(
    Array.from(messageImageMap.entries()).flatMap(([messageId, images]) =>
      images.map(async (image) => {
        const summary = await analyzeSingleMediaImage(messageId, image);
        if (!summary) return;
        const existing = messageMediaAnalysisMap.get(messageId) ?? [];
        existing.push(summary);
        messageMediaAnalysisMap.set(messageId, existing);
      }),
    ),
  );

  // -------------------------------------------------------------------------
  // System prompt — Indonesian-first, English as secondary language.
  //
  // Core design decisions:
  //  • Explicitly names the server as a Discord community whose primary
  //    communication language is Indonesian; English is secondary.
  //  • Instructs the model to understand Indonesian slang, abbreviations,
  //    and culturally specific harmful patterns (SARA, hoaks, dll).
  //  • When images are present, instructs the model to treat each image as
  //    an integral part of the message that precedes it — not as standalone
  //    content — so text + image are evaluated together.
  //  • Strict JSON-only output, no markdown or prose.
  // -------------------------------------------------------------------------
  const buildSystemPrompt = (correction?: {
    error: string;
    preview: string;
  }): string => {
    const imageInstructions = `
## Instruksi Analisis Media
Gambar, sticker, embed image, preview link, dan attachment sudah dianalisis lewat request media terpisah sebelum batch utama.
Gunakan baris "Media analysis" sebagai evidence visual utama dalam keputusan moderasi batch ini.

## Panduan Khusus Sticker
- Sticker Discord adalah media kartun/meme/ilustrasi, BUKAN foto atau video nyata.
- Sticker sering bersifat humor, satir, atau ekspresi emosi yang dilebih-lebihkan.
- Gambar sticker bisa menampilkan adegan kartun yang terlihat "keras" (tokoh kartun menginjak sesuatu, ledakan komik, senjata kartun) — itu SENI KARTUN, bukan dokumentasi kekerasan nyata.
- Nama sticker yang terdengar provokatif (mis. "Singa injek pejabat", "Bom atom", dll) adalah konteks satir/humor. JANGAN flag "violence", "harassment", atau "sara" berdasarkan nama sticker saja tanpa melihat gambar.
- Jika sticker evidence hanya tersedia sebagai nama (gambar gagal diunduh), abaikan sebagai evidence pelanggaran — nama sticker saja TIDAK cukup untuk flag.
- Terapkan standar yang lebih longgar untuk konten kartun/meme dibanding foto/video nyata.

Sticker yang berhasil diunduh WAJIB diperlakukan sebagai image evidence, bukan sekadar nama sticker.
Jangan abaikan link: gunakan isi web, preview image, atau hasil analisis media link bila tersedia.
`;

    const base = `Kamu adalah asisten moderasi konten untuk server Discord berbahasa Indonesia.
Bahasa utama komunitas ini adalah BAHASA INDONESIA. Bahasa Inggris adalah bahasa sekunder.

## Konteks Server
Ini adalah server Discord komunitas Indonesia. Kamu harus memahami:
- Bahasa gaul/slang Indonesia: "anjay", "wkwk", "gws", "gaskeun", "santuy", "njir", "baka", "woy", "woi", "hadeh", dll.
- Singkatan umum: "gw", "lo", "emg", "kyk", "tdk", "krn", "jgn", dll.
- Konteks budaya lokal: SARA (Suku, Agama, Ras, Antar-golongan), hoaks, ujaran kebencian berbasis konteks Indonesia.
- Makian/kata kasar umum (seperti "anjing", "asu", "bangsat") BUKAN pelanggaran SARA. SARA khusus untuk diskriminasi/hinaan terhadap Suku, Agama, Ras, dan Antargolongan. NAMUN makian/kata kasar TETAP bisa di-flag sebagai "harassment" atau "vulgar_language" sesuai konteks (misalnya jika ditujukan ke orang lain atau dalam tone agresif). Jangan flag sebagai SARA, tapi flag sesuai kategori yang tepat.
- Kata "asus" adalah merk teknologi, jangan pernah dianggap sebagai makian "asu".
- Perbedaan antara humor/banter biasa vs konten yang benar-benar melanggar.
- "woy"/"woi" adalah sapaan/interjeksi informal Indonesia dan tidak boleh dianggap SARA, hate speech, atau harassment tanpa target hinaan/ancaman jelas.
- Discord custom emoji seperti <:hadeh:123> atau [emoji:hadeh] adalah ekspresi/emoji, bukan pelanggaran teks. Gunakan sebagai konteks ekspresi saja.
- Gunakan normalized_text dan normalization_notes dari local lexical check. Jika notes hanya berisi slang/emoji aman (woy, woi, hadeh, dll) dan "no Indonesian badword detected", jangan flag karena kata slang itu saja. NAMUN jika notes menyatakan "Indonesian badword detected" (misalnya "anjing", "bangsat", "asu"), itu EVIDENCE profanitas — gunakan sebagai konteks untuk menilai apakah perlu flag sebagai harassment/vulgar_language, bukan sebagai alasan untuk mengabaikan.
- Topik seksual/identitas yang dibatasi server: LGBT/LGBTQ, furry/transfurry, therian, otherkin, protogen, yiff/fursona/fursuit, dan istilah terkait. Jika pesan mempromosikan, mendukung, mengajak, menyatakan identitas/roleplay, membagikan media, atau menjadikan topik ini sebagai pembahasan utama, flag sebagai "sexual_deviation". Jika pesan hanya mengecam/menolak topik tersebut tanpa hinaan ke orang/kelompok, status bisa "clean" atau "warn" sesuai tone. Jangan gunakan kebijakan ini untuk membenarkan doxxing, ancaman, atau penghinaan personal; ancaman/hinaan tetap flag sebagai harassment/hate_speech juga.
- Kalimat ambigu dalam bahasa Indonesia harus diberi keputusan final: "clean" bila bukti pelanggaran tidak jelas, "flagged" bila bukti pelanggaran jelas.
- Jangan pernah menulis analisis yang meminta admin/moderator memeriksa ulang, menyebut kurang konteks, atau tidak bisa menentukan. Berikan kesimpulan langsung berdasarkan teks + media + konteks yang tersedia.
- Gambar, sticker, embed, dan preview link adalah evidence utama yang setara dengan teks, bukan sekadar URL teks.
- Pornografi/NSFW, hentai, bokep, ajakan seksual, roleplay seksual, atau istilah seksual eksplisit harus di-flag sebagai "sexual_content"; jika melibatkan anak/di bawah umur/loli/shota/CP/pedofil, flag sebagai "child_safety" dan "illegal_content".
- Judi/slot/togel/casino/parlay/maxwin/RTP/deposit/withdraw dalam konteks promosi atau ajakan harus di-flag sebagai "gambling" dan bila spam/scam juga tambahkan "spam" atau "scam".
- Narkoba/obat terlarang/ganja/sabu/kokain/ekstasi dalam konteks jual beli, promosi, atau ajakan penggunaan harus di-flag sebagai "drugs".
- Ancaman kekerasan, ajakan bunuh diri, self-harm, doxxing, scam finansial/crypto/phishing, dan spam self-promo harus diprioritaskan walau teksnya bercampur slang bercanda.
- Istilah agama/suku/ras harus dinilai hati-hati: penyebutan netral/ibadah/edukasi = clean; hinaan, generalisasi negatif, provokasi, atau ajakan diskriminatif = flag "sara", "hate_speech", atau "religious_insult" sesuai konteks.
${imageInstructions}
## Konteks Percakapan
${contextText}

## Format Output
Balas HANYA dengan satu objek JSON valid. Tanpa markdown, tanpa prose, tanpa komentar, tanpa XML.
Struktur wajib:
{
  "results": [
    {
      "message_id": "<ID string PERSIS seperti di input>",
      "status": "clean" | "warn" | "flagged",
      "flags": [<string array, kosong jika clean>],
      "score": <float 0.0–1.0>,
      "categories": [<kategori kebijakan, kosong jika clean>],
      "severity": "none" | "low" | "medium" | "high" | "critical",
      "confidence": <float 0.0–1.0>,
      "recommended_action": "none" | "monitor" | "warn" | "review" | "delete" | "escalate",
      "policy_version": "default-2026-05-30",
      "evidence": [<kutipan/evidence singkat dari teks/media/konteks>],
      "analysis": "<penjelasan singkat dalam Bahasa Indonesia, maks 2 kalimat>"
    }
  ]
}

Kriteria status:
- "clean": tidak ada pelanggaran yang terdeteksi, atau kasus masih ambigu setelah semua evidence dianalisis
- "warn": risiko ringan yang konkret terdeteksi, misalnya spam borderline atau harassment ringan; BUKAN untuk kurang konteks/perlu admin cek
- "flagged": pelanggaran jelas terdeteksi

Larangan output analysis:
- Jangan tulis "kurang konteks", "perlu dicek admin", "perlu moderator periksa", "tidak bisa menentukan", atau frasa deferral sejenis.
- Jika evidence tidak cukup kuat untuk pelanggaran, status harus "clean" dan analysis menjelaskan alasan langsung.

Flag yang valid: spam, hate_speech, sara, hoaks, harassment, vulgar_language, sexual_content, sexual_deviation, violence, self_harm, doxxing, scam, misinformation, nsfw_image, gore_image, illegal_content, gambling, drugs, child_safety, financial_scam, religious_insult, self_promo

CRITICAL: "message_id" HARUS berupa STRING (dibungkus tanda kutip ganda). Jangan perlakukan ID sebagai angka — ini snowflake Discord yang bisa kehilangan presisi jika diparse sebagai number.`;

    if (correction) {
      return `${base}\n\nRESPON SEBELUMNYA GAGAL VALIDASI.\nError: ${correction.error}\nPreview respons tidak valid:\n${correction.preview}\n\nCoba lagi dengan output JSON yang benar sesuai skema di atas.`;
    }
    return base;
  };

  // -------------------------------------------------------------------------
  // Build the user-turn content.
  // Media images are NOT sent in the main moderation batch. They are analyzed
  // above through separate vision requests, then injected here as text evidence.
  // -------------------------------------------------------------------------

  let lastParseError: string | null = null;
  let lastInvalidContent: string | null = null;

  // Pre-compute text evidence for all targets in parallel
  const textEvidenceMap = new Map<string, string>();
  await Promise.all(
    targets.map(async (msg) => {
      const content = msg.edited_content ?? msg.content;
      const evidence = await formatModerationTextEvidenceForPrompt(content);
      textEvidenceMap.set(msg.id, evidence);
    }),
  );

  const buildMessageContent = async (): Promise<string> => {
    const correction = lastParseError
      ? {
          error: lastParseError,
          preview: lastInvalidContent?.slice(0, 800) ?? "<empty>",
        }
      : undefined;

    const systemText = buildSystemPrompt(correction);

    const messagesBlock = targets
      .map((msg) => {
        const content = msg.edited_content ?? msg.content;
        const webTexts = messageWebTextMap.get(msg.id) ?? [];
        const mediaAnalyses = messageMediaAnalysisMap.get(msg.id) ?? [];
        const webContext =
          webTexts.length > 0 ? `\n${webTexts.join("\n")}` : "";
        const textEvidence = textEvidenceMap.get(msg.id) ?? "";
        const textContext = textEvidence ? `\n${textEvidence}` : "";
        const mediaAnalysisContext =
          mediaAnalyses.length > 0 ? `\n${mediaAnalyses.join("\n")}` : "";
        const mediaEvidence = extractMessageMediaEvidence(msg.metadata);
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
        return `[target] id=${msg.id} user=${msg.username}: ${content}${mediaContext ? ` ${mediaContext}` : ""}${textContext}${webContext}${mediaAnalysisContext}`;
      })
      .join("\n");

    return `${systemText}\n\n## Pesan yang Dianalisis\n${messagesBlock}`;
  };

  let parsed: AnalysisResult[];
  let result: OpenAI.Chat.Completions.ChatCompletion | null = null;
  try {
    const analysis = await retryWithBackoff(
      async () => {
        try {
          const completion = await openai.chat.completions.create({
            model: config.AI_LLM_MODEL,
            messages: [
              {
                role: "user",
                content: await buildMessageContent(),
              },
            ],
            temperature: 0.2,
            top_p: 0.95,
            max_tokens: 16384,
            response_format: {
              type: "json_object",
            },
            stream: false,
            chat_template_kwargs: { enable_thinking: false },
            reasoning_budget: 0,
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

          if (
            !completion.choices ||
            !Array.isArray(completion.choices) ||
            !completion.choices[0]
          ) {
            throw new Error("Invalid LLM response structure");
          }

          const content = completion.choices[0].message?.content;
          if (!content) {
            throw new Error("No content in LLM response");
          }

          try {
            return {
              parsed: parseModerationResponse(content, targetIds),
              result: completion,
            };
          } catch (parseError) {
            lastParseError =
              parseError instanceof Error
                ? parseError.message
                : String(parseError);
            lastInvalidContent = content;
            log.warn(
              {
                error: lastParseError,
                contentLength: content.length,
                contentPreview: content.substring(0, 1000),
                fullContent: content,
                targetIds,
                model: config.AI_LLM_MODEL,
              },
              "Failed to parse moderation response from LLM",
            );
            throw parseError;
          }
        } catch (apiError: any) {
          // Immediately abort retries on rate limits or auth errors so the
          // message can return to the DB queue instead of bursting retries.
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
    if (!lastInvalidContent) {
      throw parseError;
    }

    const errorMsg =
      parseError instanceof Error ? parseError.message : String(parseError);
    const content: string = lastInvalidContent;

    log.error(
      {
        error: errorMsg,
        contentLength: content.length,
        contentPreview: content.substring(0, 500),
        fullContent: content,
        targetIds,
        model: config.AI_LLM_MODEL,
        timestamp: new Date().toISOString(),
      },
      "Robust Fallback: Failed to parse moderation response. Marking all targets as analysis errors.",
    );
    parsed = targetIds.map((id) => ({
      messageId: id,
      status: "error",
      flags: ["analysis_parse_failed"],
      score: 0,
      analysis: `Parsing failed: ${errorMsg}.`,
      categories: ["analysis_parse_failed"],
      severity: "none",
      confidence: 0,
      recommendedAction: "review",
      policyVersion: "default-2026-05-30",
      evidence: [],
    }));
  }

  log.info(
    {
      targetCount: targets.length,
      resultCount: parsed.length,
    },
    "Moderation analysis complete",
  );

  return {
    results: parsed,
    raw: result,
  };
}

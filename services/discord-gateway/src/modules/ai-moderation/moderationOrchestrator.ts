/**
 * moderationOrchestrator.ts
 *
 * Orchestrates LLM-based moderation analysis — manages batch splitting,
 * parallel text+media analysis, LLM calls with retry, and cache handling.
 * Extracted from llmModerationClient.ts to reduce file size.
 */
import { createChildLogger } from "@bete/shared/logger";
import { delay, retryWithBackoff } from "@bete/shared/utils";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { config } from "../../shared/config/config.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import { getMessageById } from "../message-capture/messageStore.js";
import type { AnalysisResult, AttachmentRecord, MessageRecord } from "../message-capture/types.js";
import { getChannelCulture } from "./channelCultureStore.js";
import { llmChat } from "./llmClient.js";
import { buildSystemPrompt as buildSystemPromptModular, sanitizeAiContent } from "./moderationPrompt.js";
import { logModerationAnalysis, logModerationError } from "./responseLogger.js";
import { searchSearxng, extractSearchQueries, formatSearchResults, initSearxngCache } from "./searxngSearch.js";
import { escapeXml, getAnalysisContent, buildReferenceXml } from "./moderationBuilders.js";
import { hasMediaContent, analyzeSingleMediaImage, prepareMediaMessage } from "./mediaAnalysisClient.js";
import type { PreparedMediaMessage, MessageImagePart } from "./mediaAnalysisClient.js";
import {
  getCachedTextModeration,
  getRecentCorrectedModerations,
  makeTextModerationCacheKey,
  setCachedTextModeration,
} from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
import { getUserProfile } from "./userProfileStore.js";
import { initializeUserReputation } from "./userReputationStore.js";
import { createAbortTimeout, isAbortError } from "./abortHelper.js";

const log = createChildLogger("moderationOrchestrator");

// ---------------------------------------------------------------------------
// Retry state
// ---------------------------------------------------------------------------
interface RetryState {
  lastParseError: string | null;
  lastInvalidContent: string | null;
}

// ─── Few-shot correction builder ────────────────────────────────────────────
const _buildCorrectedFewShotExamples = async (): Promise<string> => {
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
      lines.push(`- Konten: "${c.contentSnippet.substring(0, 100)}" → sebelumnya di-flag sebagai [${origFlags}], dikoreksi menjadi [${corrFlags}]${notes}`);
    }
    lines.push("JANGAN ulangi kesalahan yang sama. Jika konten serupa dengan contoh di atas, gunakan koreksi yang sudah ditentukan.");
    return lines.join("\n");
  } catch {
    return "";
  }
};

// ─── In-memory cache untuk correctedFewShotExamples ──────────────────────
// getCachedFewShotExamples() dipanggil di banyak tempat (setiap sub-batch
// dan retry), padahal datanya jarang berubah. Cache sederhana TTL 60 detik
// mengurangi redundant DB queries dari O(retries × subBatches) ke O(1).
let _fewShotCache: { result: string; expiresAt: number } | null = null;
const FEW_SHOT_CACHE_TTL = 60_000; // 60 detik

async function getCachedFewShotExamples(): Promise<string> {
  if (_fewShotCache && Date.now() < _fewShotCache.expiresAt) {
    return _fewShotCache.result;
  }
  const result = await _buildCorrectedFewShotExamples();
  _fewShotCache = { result, expiresAt: Date.now() + FEW_SHOT_CACHE_TTL };
  return result;
}

// ---------------------------------------------------------------------------
// Shared LLM call + parse + fallback helper
// ---------------------------------------------------------------------------
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

          if (!completion) throw new Error("LLM client unavailable (no API key)");
          if (!completion.choices || !Array.isArray(completion.choices) || !completion.choices[0]) {
            throw new Error("Invalid LLM response structure");
          }

          const rawContent = completion.choices[0].message?.content;
          if (!rawContent) throw new Error("No content in LLM response");

          try {
            const { parseModerationResponse } = await import("./moderationResponseParser.js");
            return { parsed: parseModerationResponse(rawContent, targetIds), result: completion };
          } catch (parseError) {
            state.lastParseError = parseError instanceof Error ? parseError.message : String(parseError);
            state.lastInvalidContent = rawContent;
            log.warn({ error: state.lastParseError, contentLength: rawContent.length, targetIds, model: config.AI_LLM_MODEL }, `Failed to parse moderation response (${label})`);
            throw parseError;
          }
        } catch (apiError: any) {
          if (apiError?.status === 429) {
            log.warn({ status: 429, targetIds, model: config.AI_LLM_MODEL, label }, "LLM API 429 — will retry");
            await delay(Math.floor(Math.random() * 1000) + 500);
            throw apiError;
          }
          if (apiError?.status === 401 || apiError?.status === 403) {
            const abortErr = new Error(String(apiError));
            abortErr.name = "AbortError";
            throw abortErr;
          }
          if (apiError?.status >= 500 || apiError?.code === "ECONNRESET" || apiError?.code === "ETIMEDOUT" || apiError?.name === "APIError") {
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
    if (err instanceof Error && err.name === "AbortError") throw err;

    const errorMsg = err instanceof Error ? err.message : String(err);
    const isApiError = !state.lastInvalidContent;
    const apiErrorCode = isApiError ? `MOD_${Date.now().toString(36).slice(0, 6)}` : null;

    if (isApiError) {
      log.warn({ error: errorMsg, targetIds, model: config.AI_LLM_MODEL, label }, `LLM API error after retries (${label})`);
      logModerationError(targetIds, config.AI_LLM_MODEL, err instanceof Error ? err : new Error(String(err)), { phase: "api_call", label });
      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error" as const,
        flags: ["analysis_api_failed"],
        score: 0,
        analysis: `Analisis gagal karena error pada server AI dan memerlukan pemeriksaan manual. Error code: ${apiErrorCode}`,
        categories: ["analysis_api_failed"],
        severity: "none" as const,
        confidence: 0,
        recommendedAction: "review" as const,
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    } else {
      const parseMsg = err instanceof Error ? err.message : String(err);
      const contentPreview = state.lastInvalidContent?.substring(0, 500) ?? "<empty>";
      log.error({ error: parseMsg, contentLength: state.lastInvalidContent?.length ?? 0, contentPreview, targetIds, model: config.AI_LLM_MODEL }, `Robust Fallback (${label}): parse error`);
      logModerationError(targetIds, config.AI_LLM_MODEL, err instanceof Error ? err : new Error(String(err)), { phase: "parse_response", label, contentLength: state.lastInvalidContent?.length ?? 0 });
      const errorCode = `MOD_${Date.now().toString(36).slice(0, 6)}`;
      parsed = targetIds.map((id) => ({
        messageId: id,
        status: "error" as const,
        flags: ["analysis_parse_failed"],
        score: 0,
        analysis: `Analisis gagal dan memerlukan pemeriksaan manual. Error code: ${errorCode}`,
        categories: ["analysis_parse_failed"],
        severity: "none" as const,
        confidence: 0,
        recommendedAction: "review" as const,
        policyVersion: "default-2026-05-30",
        evidence: [],
      }));
    }
  }
  return { results: parsed, raw: result };
}

// ---------------------------------------------------------------------------
// Text-only batch
// ---------------------------------------------------------------------------
async function runTextOnlyBatch(
  targets: MessageRecord[],
  contextText: string,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  const maxBatchSize = config.AI_LLM_TEXT_BATCH_SIZE ?? 20;
  const timeoutMs = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;

  // Parallel: URL fetch + SearXNG
  const urlFetchPromise = (async () => {
    const allUrls = new Set<string>();
    for (const msg of targets) {
      for (const url of extractUrlsFromText(msg.edited_content ?? msg.content)) allUrls.add(url);
    }
    const urlArr = Array.from(allUrls).slice(0, 10);
    if (urlArr.length === 0) return new Map<string, string>();

    // Per-host rate limiting: add a small delay between requests to the same
    // domain to avoid overwhelming third-party servers with concurrent fetches.
    const hostGroups = new Map<string, string[]>();
    for (const url of urlArr) {
      try {
        const host = new URL(url).hostname;
        const group = hostGroups.get(host) ?? [];
        group.push(url);
        hostGroups.set(host, group);
      } catch { /* invalid URL, skip */ }
    }
    const results = await Promise.allSettled(
      Array.from(hostGroups.values()).flatMap((group) =>
        group.map((url, idx) => () =>
          idx > 0 ? delay(200 * idx).then(() => fetchUrlSafely(url)) : fetchUrlSafely(url),
        ),
      ).map((fn) => fn()),
    );
    const map = new Map<string, string>();
    for (let i = 0; i < urlArr.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.type === "text" && r.value.textContent) {
        map.set(urlArr[i], r.value.textContent);
      }
    }
    return map;
  })();

  const searxngPromise = (async () => {
    const queries = new Set<string>();
    for (const msg of targets) {
      for (const q of extractSearchQueries(msg.edited_content ?? msg.content)) queries.add(q);
    }
    if (queries.size === 0) return new Map<string, string>();
    const queryArr = Array.from(queries).slice(0, 3);
    const results = await Promise.allSettled(queryArr.map((q) => searchSearxng(q)));
    const map = new Map<string, string>();
    for (let i = 0; i < queryArr.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.length > 0) map.set(queryArr[i], formatSearchResults(r.value));
    }
    return map;
  })();

  const [urlFetchMap, searxngResults] = await Promise.all([urlFetchPromise, searxngPromise]);

  // Deduplicate identical short messages
  const shortContentGroups = new Map<string, MessageRecord[]>();
  const deduplicatedTargets: MessageRecord[] = [];
  const groupMapping = new Map<string, string[]>();
  for (const msg of targets) {
    const rawContent = (msg.edited_content ?? msg.content).trim();
    if (rawContent.length > 0 && rawContent.length < 20) {
      const groupKey = rawContent.toLowerCase();
      if (shortContentGroups.has(groupKey)) {
        shortContentGroups.get(groupKey)?.push(msg);
      } else {
        shortContentGroups.set(groupKey, [msg]);
        deduplicatedTargets.push(msg);
      }
    } else {
      deduplicatedTargets.push(msg);
    }
  }
  for (const [, members] of shortContentGroups) {
    if (members.length > 1) groupMapping.set(members[0].id, members.map((m) => m.id));
  }

  // Split into sub-batches
  const subBatches: MessageRecord[][] = [];
  for (let i = 0; i < deduplicatedTargets.length; i += maxBatchSize) {
    subBatches.push(deduplicatedTargets.slice(i, i + maxBatchSize));
  }

  const allResults: AnalysisResult[] = [];
  let lastRaw: unknown = null;
  const channelId = targets[0]?.channel_id ?? "";
  const channelCultureObj = channelId ? await getChannelCulture(channelId) : null;
  const channelCulture = channelCultureObj?.culture_summary;

  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    const targetIds = batch.map((t) => t.id);

    // User reputation + profiles
    const userContexts = new Map<string, string>();
    const userProfiles = new Map<string, string>();
    for (const msg of batch) {
      if (!userContexts.has(msg.user_id)) {
        const rep = await initializeUserReputation(msg.user_id, msg.guild_id);
        userContexts.set(msg.user_id, `<user_reputation trust_score="${rep.trust_score}" />`);
      }
      if (!userProfiles.has(msg.user_id)) {
        const profile = await getUserProfile(msg.user_id);
        userProfiles.set(msg.user_id, profile ? `<user_profile>${sanitizeAiContent(profile.profile_summary)}</user_profile>` : "");
      }
    }

    const buildContent = async (state: RetryState): Promise<string> => {
      const correction = state.lastParseError ? { error: state.lastParseError, preview: state.lastInvalidContent?.slice(0, 800) ?? "<empty>" } : undefined;
      const correctedExamples = await getCachedFewShotExamples();
      const systemText = buildSystemPromptModular({ contextText, mode: "text", correction, correctedExamples, channelCulture });

      const messagesBlock = (await Promise.all(batch.map(async (msg) => {
        const content = getAnalysisContent(msg);
        const msgUrls = extractUrlsFromText(content);
        const urlContexts = msgUrls.map((url) => {
          const ft = urlFetchMap.get(url);
          return ft ? `<web_content url="${escapeXml(url)}">${escapeXml(ft)}</web_content>` : null;
        }).filter(Boolean).join("\n");
        const webContext = urlContexts ? `\n${urlContexts}` : "";
        const userCtx = userContexts.get(msg.user_id) ?? "";
        const userProfileCtx = userProfiles.get(msg.user_id) ?? "";
        const refXml = await buildReferenceXml(msg);
        return `<message id="${msg.id}" user="${msg.username}">\n  ${userCtx}${userProfileCtx ? `\n  ${userProfileCtx}` : ""}${refXml ? `\n  ${refXml}` : ""}\n  <content>${escapeXml(content)}</content>${webContext}\n</message>`;
      }))).join("\n");

      const searxngBlock = searxngResults.size > 0
        ? `\n\n<web_searches>\n${Array.from(searxngResults.entries()).map(([q, xml]) => `  <search_query query="${escapeXml(q)}">\n${xml}  </search_query>`).join("\n")}\n</web_searches>`
        : "";
      return `${systemText}${searxngBlock}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;
    };

    const { signal, cleanup } = createAbortTimeout(timeoutMs);

    let batchResult: { results: AnalysisResult[]; raw: unknown };
    try {
      batchResult = await callModerationLLM(buildContent, targetIds, `text-batch-${i + 1}`, signal);
    } catch (err: any) {
      if (isAbortError(err)) {
        throw new Error(`Text-only batch sub-batch ${i + 1} timed out for messages ${targetIds.join(", ")}`);
      }
      throw err;
    } finally {
      cleanup();
    }

    // Fan-out results for deduplicated messages
    const fannedOutResults = groupMapping.size > 0
      ? batchResult.results.flatMap((result) => {
          const members = groupMapping.get(result.messageId);
          return members ? members.map((memberId) => ({ ...result, messageId: memberId })) : [result];
        })
      : batchResult.results;

    allResults.push(...fannedOutResults);
    if (batchResult.raw) lastRaw = batchResult.raw;

    logModerationAnalysis(targetIds, config.AI_LLM_MODEL, batchResult.results, 0, undefined);
  }

  log.debug({ targetCount: targets.length, resultCount: allResults.length, subBatchCount: subBatches.length }, "Text-only batch analysis complete");
  return { results: allResults, raw: lastRaw };
}

// ---------------------------------------------------------------------------
// Media batch — download + vision + single LLM call
// ---------------------------------------------------------------------------
async function runMediaBatch(
  targets: MessageRecord[],
  contextText: string,
  attachments: AttachmentRecord[] | undefined,
): Promise<{ results: AnalysisResult[]; raw: unknown }> {
  if (!targets.length) return { results: [], raw: null };

  // Lazy init sticker cache
  const { isStickerCacheReady, initStickerCache } = await import("./stickerCache.js");
  if (!isStickerCacheReady()) {
    await initStickerCache().catch((err: unknown) => log.warn({ error: err instanceof Error ? err.message : String(err) }, "Sticker cache init failed"));
  }

  // Phase A: Prepare ALL messages in parallel
  const prepared = await Promise.all(targets.map((target) => prepareMediaMessage(target, attachments)));

  // Phase B: ONE batched LLM call
  const targetIds = targets.map((t) => t.id);
  const channelId = targets[0].channel_id;
  const channelCultureObj = channelId ? await getChannelCulture(channelId) : null;
  const channelCulture = channelCultureObj?.culture_summary;
  const correctedExamples = await getCachedFewShotExamples();
  const systemText = buildSystemPromptModular({ contextText, mode: "mixed", correctedExamples, channelCulture });

  const messagesBlock = prepared.map((p) => p.messageBlock).join("\n");
  const userContent = `${systemText}\n\n<messages_to_analyze>\n${messagesBlock}\n</messages_to_analyze>`;

  const perMsgTimeout = config.AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS ?? 60000;
  const batchTimeout = Math.min(Math.max(perMsgTimeout, perMsgTimeout * targets.length), 300_000);

  const { signal, cleanup } = createAbortTimeout(batchTimeout);

  try {
    const result = await callModerationLLM(
      async (_state: RetryState) => userContent,
      targetIds,
      `media-batch:${targetIds.length}msgs`,
      signal,
    );
    log.info({ mediaCount: targets.length, resultCount: result.results.length }, "Media batch analysis complete");
    return result;
  } catch (err: any) {
    if (isAbortError(err)) {
      throw new Error(`Media batch analysis timed out after ${batchTimeout}ms for ${targets.length} messages`);
    }
    throw err;
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ModerationInput {
  targets: MessageRecord[];
  contextText: string;
  attachments?: AttachmentRecord[];
}

export interface ModerationOutput {
  results: AnalysisResult[];
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Runs LLM-based moderation analysis on messages.
 * Splits text-only vs media, runs both paths in parallel, applies caching.
 */
export async function runModerationAnalysis(
  input: ModerationInput,
): Promise<ModerationOutput> {
  const { targets, contextText, attachments } = input;

  initSearxngCache(config.REDIS_URL);
  if (!targets.length) throw new Error("No targets provided for analysis");

  // Per-user moderation cache check (text-only)
  const cacheHits: AnalysisResult[] = [];
  const uncachedTargets: MessageRecord[] = [];
  const seenCacheKeys = new Set<string>();

  for (const target of targets) {
    const hasMedia = hasMediaContent(target, attachments);
    if (hasMedia) { uncachedTargets.push(target); continue; }

    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) { uncachedTargets.push(target); continue; }

    const cacheKey = makeTextModerationCacheKey(rawContent, target.user_id);
    if (seenCacheKeys.has(cacheKey)) {
      const previousHit = cacheHits.find((h) => h.messageId !== target.id);
      if (previousHit) {
        cacheHits.push({ ...previousHit, messageId: target.id });
      } else {
        uncachedTargets.push(target);
      }
      continue;
    }
    seenCacheKeys.add(cacheKey);

    try {
      const cached = await getCachedTextModeration(cacheKey);
      if (cached) {
        const hasMediaInMeta = target.metadata && (() => {
          const ev = extractMessageMediaEvidence(target.metadata);
          return ev.attachments.length > 0 || ev.stickers.length > 0 || ev.embeds.length > 0;
        })();

        if (hasMediaInMeta) {
          log.debug({ messageId: target.id, cacheKey }, "Cache entry but message has media — treating as miss");
        } else if (cached.flags.some((f) => ["analysis_api_failed", "analysis_parse_failed", "analysis_incomplete"].includes(f))) {
          log.warn({ messageId: target.id, cacheKey }, "Cache entry contains error artifact — treating as miss");
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
            recommendedAction: cached.recommendedAction as AnalysisResult["recommendedAction"],
            policyVersion: "cached-user-moderation-2026-06",
            evidence: [],
          } as AnalysisResult);
          continue;
        }
      }
    } catch { /* proceed */ }

    uncachedTargets.push(target);
  }

  if (cacheHits.length > 0) {
    log.info({ cacheHits: cacheHits.length, uncached: uncachedTargets.length, total: targets.length }, "User moderation cache applied");
  }

  if (uncachedTargets.length === 0) return { results: cacheHits, raw: null };

  // Split uncached targets
  const textOnlyTargets: MessageRecord[] = [];
  const mediaTargets: MessageRecord[] = [];
  for (const target of uncachedTargets) {
    if (hasMediaContent(target, attachments)) {
      mediaTargets.push(target);
    } else {
      textOnlyTargets.push(target);
    }
  }

  log.debug({ total: targets.length, textOnly: textOnlyTargets.length, media: mediaTargets.length, cacheHits: cacheHits.length }, "Split uncached targets");

  // Run both paths in parallel
  const [textBatchResult, mediaBatchResult] = await Promise.all([
    textOnlyTargets.length > 0
      ? runTextOnlyBatch(textOnlyTargets, contextText)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),
    mediaTargets.length > 0
      ? runMediaBatch(mediaTargets, contextText, attachments)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),
  ]);

  // Store uncached text-only results in cache
  for (const result of textBatchResult.results) {
    const target = textOnlyTargets.find((t) => t.id === result.messageId);
    if (!target) continue;
    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) continue;
    if (result.status === "error") continue;

    if (target.metadata) {
      const evidence = extractMessageMediaEvidence(target.metadata);
      if (evidence.attachments.length > 0 || evidence.stickers.length > 0 || evidence.embeds.length > 0) continue;
    }

    const cacheKey = makeTextModerationCacheKey(rawContent, target.user_id);
    setCachedTextModeration(cacheKey, {
      flags: result.flags ?? [],
      score: result.score ?? 0,
      analysis: result.analysis ?? "",
      categories: result.categories ?? result.flags ?? [],
      severity: result.severity ?? "none",
      confidence: result.confidence ?? result.score ?? 0,
      recommendedAction: result.recommendedAction ?? "none",
      status: result.status,
    }).catch((e) => log.error({ error: e instanceof Error ? e.message : String(e) }, "Failed to cache text moderation result"));
  }

  const allResults = [...cacheHits, ...textBatchResult.results, ...mediaBatchResult.results];
  const raw = textBatchResult.raw ?? mediaBatchResult.raw;

  log.debug({ targetCount: targets.length, resultCount: allResults.length, cacheHits: cacheHits.length }, "Moderation analysis complete");
  return { results: allResults, raw };
}

// ---------------------------------------------------------------------------
// Simple text-only fallback
// ---------------------------------------------------------------------------

/**
 * Simple two-step text fallback for cheap/small models.
 * Step 1: Single-word classification (clean/warn/flagged).
 * Step 2: Real analysis text (only if not clean).
 */
export async function runSimpleTextFallback(
  message: MessageRecord,
): Promise<AnalysisResult> {
  const content = getAnalysisContent(message);
  const MAX_CONTENT_CHARS = 500;
  const truncatedContent = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) + "..." : content;

  let userProfileCtx = "";
  try {
    const profile = await getUserProfile(message.user_id);
    if (profile?.profile_summary) {
      userProfileCtx = `\n\nProfil pengirim pesan:\n${sanitizeAiContent(profile.profile_summary, 2000, false)}\n`;
    }
  } catch { /* non-fatal */ }

  // Step 1: Single-word classification
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
  try {
    const completion = await llmChat({
      messages: [{ role: "user", content: classifyPrompt }],
      max_tokens: 10,
      temperature: 0.1,
    });
    const raw = completion?.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (raw.includes("flagged")) status = "flagged";
    else if (raw.includes("warn")) status = "warn";
    else status = "clean";
    log.info({ messageId: message.id, status, raw }, "Simple fallback step 1");
  } catch (error) {
    log.warn({ messageId: message.id, error: error instanceof Error ? error.message : String(error) }, "Simple fallback step 1 failed — defaulting to clean");
    status = "clean";
  }

  // Step 2: Reason + category (only if not clean)
  let analysis: string;
  let category = "";

  if (status === "clean") {
    analysis = `${message.username ?? "user"}: ${content.length > 200 ? content.slice(0, 200) + "..." : content}. Percakapan normal, tidak ada pelanggaran.`;
  } else {
    category = status === "flagged" ? "harassment" : "spam";
    const categoryOptions = status === "flagged" ? "harassment, gambling, atau sara" : "spam";
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
      if (!analysis || analysis.length < 5) {
        analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis.`;
      }
      const categoryMatch = analysis.match(/[Kk]ategori:\s*(\w+)/i);
      if (categoryMatch) {
        const parsedCat = categoryMatch[1].toLowerCase();
        if (["harassment", "spam", "gambling", "sara"].includes(parsedCat)) category = parsedCat;
        analysis = analysis.replace(/[Kk]ategori:\s*\w+\s*/i, "").trim();
      }
      log.info({ messageId: message.id, status, category, analysis: analysis.slice(0, 100) }, "Simple fallback step 2");
    } catch (error) {
      analysis = `Pesan diklasifikasikan sebagai ${status} oleh sistem moderasi otomatis berdasarkan analisis konten.`;
      log.warn({ messageId: message.id, error: error instanceof Error ? error.message : String(error) }, "Simple fallback step 2 failed");
    }
  }

  return {
    messageId: message.id,
    status,
    flags: status === "clean" ? [] : [category],
    score: status === "flagged" ? 0.7 : status === "warn" ? 0.4 : 0,
    analysis,
    categories: status === "clean" ? [] : [category],
    severity: status === "flagged" ? "medium" : status === "warn" ? "low" : "none",
    confidence: 0.6,
    recommendedAction: status === "flagged" ? "review" : status === "warn" ? "warn" : "none",
    policyVersion: "default-simple-2026-06",
    evidence: status !== "clean" ? [content.length > 120 ? content.slice(0, 120) + "..." : content] : [],
  };
}

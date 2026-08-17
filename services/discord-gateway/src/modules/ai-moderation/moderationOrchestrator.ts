/**
 * moderationOrchestrator.ts
 *
 * Orchestrates LLM-based moderation analysis — manages batch splitting,
 * parallel text+media analysis, LLM calls with retry, and cache handling.
 */
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { initCacheStore } from "./cacheStore.js";
import { embedTexts, isEmbeddingEnabled } from "./embeddingClient.js";
import { hasMediaContent } from "./mediaAnalysisClient.js";
import { runMediaBatch } from "./mediaBatchProcessor.js";
import { isQdrantConfigured, searchQdrantBatch } from "./qdrantClient.js";
import { logCacheEvent } from "./responseLogger.js";
import { runTextOnlyBatch } from "./textBatchProcessor.js";
import {
  findSimilarTextModeration,
  getCachedTextModeration,
  makeModerationContextKey,
  makeTextModerationCacheKey,
  parseQdrantVerdict,
  setCachedTextModeration,
} from "./textCacheStore.js";

const log = createChildLogger("moderationOrchestrator");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ModerationInput {
  targets: MessageRecord[];
  /**
   * Pre-built XML context block for the USER message (from
   * `buildConversationContextBlock`): `<location_context .../>` +
   * `<conversation_context>...</conversation_context>`. Kept out of the
   * system prompt so it stays stable/cacheable per mode.
   */
  contextBlock: string;
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
 *
 * Cache strategy (two-phase, batched):
 *  1. Exact-hash lookups (no API) — key is content + conversation context
 *     (channel/thread) because LLM verdicts depend on context.
 *  2. Semantic near-duplicate lookup — ONE embeddings call for all uncached
 *     text targets, then ONE Qdrant batch search (index-aligned), instead of
 *     N sequential embed→search round-trips.
 */
export async function runModerationAnalysis(
  input: ModerationInput,
): Promise<ModerationOutput> {
  const { targets, contextBlock, attachments } = input;

  initCacheStore(config.REDIS_URL);
  if (!targets.length) throw new Error("No targets provided for analysis");

  // ── Phase 1: exact-hash cache (per conversation context) ────────────────
  const cacheHits: AnalysisResult[] = [];
  const uncachedTargets: MessageRecord[] = [];
  // cacheKey → result for identical-content dedupe within one batch
  const hitByKey = new Map<string, AnalysisResult>();
  // Embedding per exact cache key — computed once during lookup, reused
  // when the fresh LLM verdict is written back to the semantic cache.
  const embeddingsByKey = new Map<string, number[]>();

  for (const target of targets) {
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

    const cacheKey = makeTextModerationCacheKey(
      rawContent,
      makeModerationContextKey(target),
    );
    const seen = hitByKey.get(cacheKey);
    if (seen) {
      // Same content already resolved this batch — reuse the verdict.
      cacheHits.push({ ...seen, messageId: target.id });
      continue;
    }

    try {
      const cached = await getCachedTextModeration(cacheKey);
      if (cached) {
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
            { messageId: target.id, cacheKey },
            "Cache entry but message has media — treating as miss",
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
          const hit: AnalysisResult = {
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
          };
          cacheHits.push(hit);
          hitByKey.set(cacheKey, hit);
          logCacheEvent("hit", cacheKey, "text");
          continue;
        }
      }
    } catch {
      /* proceed */
    }

    uncachedTargets.push(target);
  }

  // ── Phase 2: semantic cache — batched (one embed call + one Qdrant
  //    batch search for ALL uncached text targets) ─────────────────────────
  if (isEmbeddingEnabled()) {
    const semanticCandidates = uncachedTargets
      .map((t) => ({
        target: t,
        cacheKey: makeTextModerationCacheKey(
          t.edited_content ?? t.content,
          makeModerationContextKey(t),
        ),
      }))
      .filter(({ target }) => {
        const raw = (target.edited_content ?? target.content).trim();
        if (raw.length < 5) return false;
        if (hasMediaContent(target, attachments)) return false;
        return !hitByKey.has(
          makeTextModerationCacheKey(raw, makeModerationContextKey(target)),
        );
      });

    if (semanticCandidates.length > 0) {
      const texts = semanticCandidates.map(
        ({ target }) => target.edited_content ?? target.content,
      );
      const embeddings = await embedTexts(texts);
      if (embeddings && embeddings.length === texts.length) {
        // index-aligned with semanticCandidates
        for (let i = 0; i < semanticCandidates.length; i++) {
          const { cacheKey } = semanticCandidates[i];
          embeddingsByKey.set(cacheKey, embeddings[i]);
        }

        if (isQdrantConfigured()) {
          const batchHits = await searchQdrantBatch(
            embeddings,
            config.AI_LLM_EMBEDDING_MAX_CANDIDATES,
            config.AI_LLM_EMBEDDING_MIN_SIMILARITY,
          );
          for (let i = 0; i < semanticCandidates.length; i++) {
            const { target, cacheKey } = semanticCandidates[i];
            const hits = batchHits[i] ?? [];
            if (hits.length === 0) continue;
            const verdict = parseQdrantVerdict(hits[0].payload, hits[0].score);
            if (!verdict) continue;
            log.debug(
              {
                messageId: target.id,
                similarity: Number(verdict.similarity.toFixed(4)),
                status: verdict.status,
              },
              "Semantic moderation cache hit — reusing stored verdict",
            );
            const hit: AnalysisResult = {
              messageId: target.id,
              status: verdict.status,
              flags: verdict.flags,
              score: verdict.score,
              analysis: verdict.analysis,
              categories: verdict.categories,
              severity: verdict.severity as AnalysisResult["severity"],
              confidence: verdict.confidence,
              recommendedAction:
                verdict.recommendedAction as AnalysisResult["recommendedAction"],
              policyVersion: "semantic-cache-2026-07",
              evidence: [],
            };
            cacheHits.push(hit);
            hitByKey.set(cacheKey, hit);
            logCacheEvent("hit", cacheKey, "text");
          }
        } else {
          // Legacy Postgres fallback path (no Qdrant): per-candidate scan.
          for (let i = 0; i < semanticCandidates.length; i++) {
            const { target, cacheKey } = semanticCandidates[i];
            const semantic = await findSimilarTextModeration(
              embeddings[i],
              config.AI_LLM_EMBEDDING_MIN_SIMILARITY,
              config.AI_LLM_EMBEDDING_MAX_CANDIDATES,
            );
            if (!semantic) continue;
            log.debug(
              {
                messageId: target.id,
                similarity: Number(semantic.similarity.toFixed(4)),
                status: semantic.status,
              },
              "Semantic moderation cache hit (PG fallback) — reusing stored verdict",
            );
            const hit: AnalysisResult = {
              messageId: target.id,
              status: semantic.status,
              flags: semantic.flags,
              score: semantic.score,
              analysis: semantic.analysis,
              categories: semantic.categories,
              severity: semantic.severity as AnalysisResult["severity"],
              confidence: semantic.confidence,
              recommendedAction:
                semantic.recommendedAction as AnalysisResult["recommendedAction"],
              policyVersion: "semantic-cache-2026-07",
              evidence: [],
            };
            cacheHits.push(hit);
            hitByKey.set(cacheKey, hit);
            logCacheEvent("hit", cacheKey, "text");
          }
        }

        // Drop semantic hits from the LLM work queue.
        for (let i = uncachedTargets.length - 1; i >= 0; i--) {
          const t = uncachedTargets[i];
          const key = makeTextModerationCacheKey(
            t.edited_content ?? t.content,
            makeModerationContextKey(t),
          );
          if (hitByKey.has(key)) {
            uncachedTargets.splice(i, 1);
          }
        }
      }
    }
  }

  if (cacheHits.length > 0) {
    log.info(
      {
        cacheHits: cacheHits.length,
        uncached: uncachedTargets.length,
        total: targets.length,
      },
      "User moderation cache applied",
    );
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

  log.debug(
    {
      total: targets.length,
      textOnly: textOnlyTargets.length,
      media: mediaTargets.length,
      cacheHits: cacheHits.length,
    },
    "Split uncached targets",
  );

  // Run both paths in parallel
  const [textBatchResult, mediaBatchResult] = await Promise.all([
    textOnlyTargets.length > 0
      ? runTextOnlyBatch(textOnlyTargets, contextBlock)
      : Promise.resolve({ results: [] as AnalysisResult[], raw: null }),
    mediaTargets.length > 0
      ? runMediaBatch(mediaTargets, contextBlock, attachments)
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
      if (
        evidence.attachments.length > 0 ||
        evidence.stickers.length > 0 ||
        evidence.embeds.length > 0
      )
        continue;
    }

    const cacheKey = makeTextModerationCacheKey(
      rawContent,
      makeModerationContextKey(target),
    );
    setCachedTextModeration(
      cacheKey,
      {
        flags: result.flags ?? [],
        score: result.score ?? 0,
        analysis: result.analysis ?? "",
        categories: result.categories ?? result.flags ?? [],
        severity: result.severity ?? "none",
        confidence: result.confidence ?? result.score ?? 0,
        recommendedAction: result.recommendedAction ?? "none",
        status: result.status,
      },
      embeddingsByKey.get(cacheKey),
    ).catch(() => {});
  }

  const allResults = [
    ...cacheHits,
    ...textBatchResult.results,
    ...mediaBatchResult.results,
  ];
  const raw = textBatchResult.raw ?? mediaBatchResult.raw;

  log.debug(
    {
      targetCount: targets.length,
      resultCount: allResults.length,
      cacheHits: cacheHits.length,
    },
    "Moderation analysis complete",
  );
  return { results: allResults, raw };
}

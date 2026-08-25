/**
 * moderationOrchestrator.ts
 *
 * Orchestrates LLM-based moderation analysis — manages batch splitting,
 * parallel text+media analysis, LLM calls with retry, and cache handling.
 */

import { LRUCache } from "lru-cache";
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
  bumpTextModerationHitCounts,
  ERROR_ARTIFACT_FLAGS,
  findSimilarTextModeration,
  getCachedTextModerations,
  isGloballyReusableCleanVerdict,
  isSemanticBandAccepted,
  makeModerationContextKey,
  makeTextModerationCacheKey,
  parseQdrantVerdict,
  type StoredModerationVerdict,
  setCachedTextModeration,
  upsertBareKeyToQdrant,
} from "./textCacheStore.js";

const log = createChildLogger("moderationOrchestrator");

/**
 * Bare keys already written this process (dual-key write-back dedupe).
 * LRU-bounded so a long-lived gateway can't grow it without limit; the DB
 * upsert underneath is idempotent anyway — this just avoids redundant writes.
 */
const globalBareKeysWritten = new LRUCache<string, true>({ max: 5000 });

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

  // ── Phase 1: exact-hash cache — ONE batched DB query ────────────────────
  // Key is content + conversation context (channel/thread). On a scoped miss
  // we also probe the legacy bare key: verdicts that CANNOT trigger an action
  // (clean, flagless, action=none) may be reused across channels under strict
  // freshness + confidence guards — flagged/warn verdicts never leave their
  // conversation. This replaced the old N-sequential-query loop (60-message
  // burst = 60 PgBouncer round-trips before).
  const cacheHits: AnalysisResult[] = [];
  const uncachedTargets: MessageRecord[] = [];
  // cacheKey → representative result for identical-content dedupe
  const hitByKey = new Map<string, AnalysisResult>();
  // Embedding per exact cache key — computed once during lookup, reused
  // when the fresh LLM verdict is written back to the semantic cache.
  const embeddingsByKey = new Map<string, number[]>();

  interface ExactCandidate {
    target: MessageRecord;
    scopedKey: string;
    bareKey: string;
  }
  const candidates: ExactCandidate[] = [];
  for (const target of targets) {
    if (hasMediaContent(target, attachments)) {
      uncachedTargets.push(target);
      continue;
    }
    const rawContent = target.edited_content ?? target.content;
    if (!rawContent.trim()) {
      uncachedTargets.push(target);
      continue;
    }
    candidates.push({
      target,
      scopedKey: makeTextModerationCacheKey(
        rawContent,
        makeModerationContextKey(target),
      ),
      bareKey: makeTextModerationCacheKey(rawContent),
    });
  }

  // Identical content within one batch resolves once (representative).
  const firstByScopedKey = new Map<string, ExactCandidate>();
  for (const c of candidates) {
    if (!firstByScopedKey.has(c.scopedKey))
      firstByScopedKey.set(c.scopedKey, c);
  }

  // Single round-trip for every key we might serve from (scoped + bare).
  const storedEntries = await getCachedTextModerations([
    ...firstByScopedKey.keys(),
    ...Array.from(firstByScopedKey.values(), (c) => c.bareKey),
  ]);
  // Keys actually served — bumped in one UPDATE at the end for metrics.
  const servedCacheKeys = new Set<string>();

  /** Validate + admit one stored verdict for a candidate. */
  const acceptExactVerdict = (
    candidate: ExactCandidate,
    cacheKey: string,
    entry: { verdict: StoredModerationVerdict },
    policyVersion: string,
  ): boolean => {
    const { verdict } = entry;
    const hasMediaInMeta =
      candidate.target.metadata &&
      (() => {
        const ev = extractMessageMediaEvidence(candidate.target.metadata);
        return (
          ev.attachments.length > 0 ||
          ev.stickers.length > 0 ||
          ev.embeds.length > 0
        );
      })();

    if (hasMediaInMeta) {
      log.debug(
        { messageId: candidate.target.id, cacheKey },
        "Cache entry but message has media — treating as miss",
      );
      return false;
    }
    if (
      verdict.flags.some((f) =>
        (ERROR_ARTIFACT_FLAGS as readonly string[]).includes(f),
      )
    ) {
      log.warn(
        { messageId: candidate.target.id, cacheKey },
        "Cache entry contains error artifact — treating as miss",
      );
      return false;
    }

    hitByKey.set(candidate.scopedKey, {
      messageId: candidate.target.id,
      status: verdict.status,
      flags: verdict.flags,
      score: verdict.score,
      analysis: verdict.analysis,
      categories: verdict.categories,
      severity: verdict.severity as AnalysisResult["severity"],
      confidence: verdict.confidence,
      recommendedAction:
        verdict.recommendedAction as AnalysisResult["recommendedAction"],
      policyVersion,
      evidence: [],
    });
    servedCacheKeys.add(cacheKey);
    logCacheEvent("hit", cacheKey, "text");
    return true;
  };

  for (const candidate of firstByScopedKey.values()) {
    const scopedEntry = storedEntries.get(candidate.scopedKey);
    if (
      scopedEntry &&
      acceptExactVerdict(
        candidate,
        candidate.scopedKey,
        scopedEntry,
        "cached-user-moderation-2026-06",
      )
    ) {
      continue;
    }

    // Context-free fallback: ONLY non-actionable clean verdicts qualify
    // (guard enforces status/flags/action/confidence/freshness). The bare
    // key equals the scoped key for context-less messages, so the guard
    // also prevents double-serving the same row.
    const bareEntry = storedEntries.get(candidate.bareKey);
    if (
      bareEntry &&
      candidate.bareKey !== candidate.scopedKey &&
      isGloballyReusableCleanVerdict(
        bareEntry.verdict,
        bareEntry.analyzedAt ?? undefined,
      )
    ) {
      acceptExactVerdict(
        candidate,
        candidate.bareKey,
        bareEntry,
        "cached-global-clean-2026-08",
      );
    }
  }

  // Fan-out: every candidate (representative + in-batch duplicates) gets its
  // own copy of the representative verdict; unresolved ones stay queued.
  for (const candidate of candidates) {
    const representative = hitByKey.get(candidate.scopedKey);
    if (representative) {
      cacheHits.push({ ...representative, messageId: candidate.target.id });
    } else {
      uncachedTargets.push(candidate.target);
    }
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
          // ONE batch search at the LOOSER threshold; per-hit re-classification
          // enforces the strict band for actionable verdicts.
          const batchHits = await searchQdrantBatch(
            embeddings,
            config.AI_LLM_EMBEDDING_MAX_CANDIDATES,
            config.AI_LLM_EMBEDDING_MIN_SIMILARITY_CLEAN,
          );
          for (let i = 0; i < semanticCandidates.length; i++) {
            const { target, cacheKey } = semanticCandidates[i];
            const hits = batchHits[i] ?? [];
            if (hits.length === 0) continue;
            const verdict = parseQdrantVerdict(hits[0].payload, hits[0].score);
            if (!verdict) continue;
            if (!isSemanticBandAccepted(verdict, verdict.similarity)) continue;
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
            servedCacheKeys.add(cacheKey); // bump hit_count for metrics
            logCacheEvent("hit", cacheKey, "text");
          }
        } else {
          // Legacy Postgres fallback path (no Qdrant): per-candidate scan.
          for (let i = 0; i < semanticCandidates.length; i++) {
            const { target, cacheKey } = semanticCandidates[i];
            const semantic = await findSimilarTextModeration(
              embeddings[i],
              config.AI_LLM_EMBEDDING_MIN_SIMILARITY_CLEAN,
              config.AI_LLM_EMBEDDING_MAX_CANDIDATES,
            );
            if (!semantic) continue;
            if (!isSemanticBandAccepted(semantic, semantic.similarity))
              continue;
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
            servedCacheKeys.add(cacheKey); // bump hit_count for metrics
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
    // Metrics: one bulk UPDATE for every exact-cache key actually served.
    bumpTextModerationHitCounts(Array.from(servedCacheKeys));
    log.info(
      {
        cacheHits: cacheHits.length,
        uncached: uncachedTargets.length,
        total: targets.length,
        servedKeys: servedCacheKeys.size,
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
    const stored = {
      flags: result.flags ?? [],
      score: result.score ?? 0,
      analysis: result.analysis ?? "",
      categories: result.categories ?? result.flags ?? [],
      severity: result.severity ?? "none",
      confidence: result.confidence ?? result.score ?? 0,
      recommendedAction: result.recommendedAction ?? "none",
      status: result.status,
    };
    setCachedTextModeration(
      cacheKey,
      stored,
      embeddingsByKey.get(cacheKey),
    ).catch(() => {});

    // Dual-key write-back (2026-08-24): the FIRST analysis of a message runs
    // WITH conversation context (accurate), but its verdict is also stored
    // under the context-free bare key so repeats in OTHER channels hit the
    // exact cache instead of paying a new LLM call. Same guard as the read
    // path — only non-actionable clean verdicts may cross channels.
    //
    // 2026-08-25 cache-hit fix: the bare key is ALSO upserted to Qdrant
    // (via upsertBareKeyToQdrant) with the SAME embedding already computed
    // at lookup time. Previously the bare key was only PG-written with
    // embedding=null — bare clean verdicts were DB-only and invisible to
    // searchQdrantBatch, capping the semantic hit-rate below the exact-cache
    // hit-rate for cross-channel repeats.
    const bareKey = makeTextModerationCacheKey(rawContent);
    if (
      bareKey !== cacheKey &&
      !globalBareKeysWritten.has(bareKey) &&
      isGloballyReusableCleanVerdict(
        {
          status: stored.status,
          flags: stored.flags,
          score: stored.score,
          analysis: stored.analysis,
          categories: stored.categories,
          severity: stored.severity,
          confidence: stored.confidence,
          recommendedAction: stored.recommendedAction,
        },
        undefined,
      )
    ) {
      globalBareKeysWritten.set(bareKey, true);
      setCachedTextModeration(bareKey, stored, null).catch(() => {});
      const bareEmbedding = embeddingsByKey.get(cacheKey);
      if (bareEmbedding && bareEmbedding.length > 0) {
        upsertBareKeyToQdrant(bareKey, stored, bareEmbedding).catch(() => {});
      }
    }
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

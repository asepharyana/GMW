/**
 * moderationOrchestrator.ts
 *
 * Orchestrates LLM-based moderation analysis — manages batch splitting,
 * parallel text+media analysis, LLM calls with retry, and cache handling.
 */
import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type {
  AnalysisResult,
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { callModerationLLM } from "./llmCaller.js";
import { hasMediaContent } from "./mediaAnalysisClient.js";
import { runMediaBatch } from "./mediaBatchProcessor.js";
import { initSearxngCache } from "./searxngSearch.js";
import { runTextOnlyBatch } from "./textBatchProcessor.js";
import {
  getCachedTextModeration,
  makeTextModerationCacheKey,
  setCachedTextModeration,
} from "./textCacheStore.js";

const log = createChildLogger("moderationOrchestrator");

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
          } as AnalysisResult);
          continue;
        }
      }
    } catch {
      /* proceed */
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
      if (
        evidence.attachments.length > 0 ||
        evidence.stickers.length > 0 ||
        evidence.embeds.length > 0
      )
        continue;
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

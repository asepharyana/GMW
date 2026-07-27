/**
 * visionAnalyzer.ts
 *
 * Vision analysis for media content — prepares media messages for the
 * moderation pipeline, runs single-image vision LLM analysis with
 * multi-layer caching, and detects whether a message has media content.
 */
import { createChildLogger } from "@bete/shared/logger";
import { delay } from "@bete/shared/utils";
import { config } from "../../shared/config/config.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type {
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { llmVision } from "./llmClient.js";
import {
  acquireMediaAnalysisLock,
  computeImagePhash,
  deleteCachedMediaAnalysis,
  FAILED_ANALYSIS_PREFIX,
  getCachedMediaAnalysis,
  getCachedMediaByPhash,
  inFlightVisionCalls,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
  upsertCachedMediaByPhash,
  visionLruCache,
} from "./mediaCache.js";
import {
  buildMediaCandidates,
  downloadAndExtractFrame,
  downloadMediaCandidate,
  fetchUrlInline,
} from "./mediaDownloader.js";
import {
  buildReferenceXml,
  escapeXml,
  getAnalysisContent,
} from "./moderationBuilders.js";
import {
  buildCustomEmojiVisionPrompt,
  buildGeneralImageVisionPrompt,
  buildStickerTextOnlyWarning,
  buildStickerVisionPrompt,
  sanitizeAiContent,
} from "./moderationPrompt.js";
import {
  extractSearchQueries,
  formatSearchResults,
  searchSearxng,
} from "./searxngSearch.js";
import { extractUrlsFromText } from "./urlFetcher.js";
import { getUserProfile } from "./userProfileStore.js";
import { initializeUserReputation } from "./userReputationStore.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type MessageImagePart = {
  type: "image_url";
  image_url: { url: string };
  sourceLabel: string;
  stickerName?: string;
  customEmojiId?: string;
  customEmojiName?: string;
};

export interface PreparedMediaMessage {
  targetId: string;
  messageBlock: string;
}

// ---------------------------------------------------------------------------
// Media detection
// ---------------------------------------------------------------------------
export function hasMediaContent(
  target: MessageRecord,
  attachments?: AttachmentRecord[],
): boolean {
  if (target.metadata) {
    const evidence = extractMessageMediaEvidence(target.metadata);
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
// Single-image vision analysis
// ---------------------------------------------------------------------------
export const analyzeSingleMediaImage = async (
  messageId: string,
  image: MessageImagePart,
): Promise<string> => {
  const cacheKey = image.customEmojiId
    ? makeCustomEmojiCacheKey(image.customEmojiId)
    : image.stickerName
      ? makeStickerCacheKey(image.stickerName)
      : makeImageCacheKey(image.image_url.url);

  const log = createChildLogger("mediaAnalysis");

  // Layer 0: LRU
  const lruCached = visionLruCache.get(cacheKey);
  if (lruCached) {
    log.debug({ cacheKey }, "Vision LRU cache HIT (in-memory)");
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${lruCached}`;
  }

  // Layer 1: DB
  const cached = await getCachedMediaAnalysis(cacheKey);
  if (cached) {
    visionLruCache.set(cacheKey, cached);
    log.debug({ cacheKey }, "Media analysis cache HIT (DB → LRU)");
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${cached}`;
  }

  // In-flight dedupe
  const existing = inFlightVisionCalls.get(cacheKey);
  if (existing) {
    log.debug({ cacheKey }, "Media analysis in-flight dedupe");
    const result = await existing;
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${result}`;
  }

  const promptText = image.stickerName
    ? buildStickerVisionPrompt(image.stickerName, messageId)
    : image.customEmojiName
      ? buildCustomEmojiVisionPrompt(image.customEmojiName, messageId)
      : buildGeneralImageVisionPrompt(image.sourceLabel, messageId);

  const visionPromise = (async (): Promise<string> => {
    // Distributed lock
    const locked = await acquireMediaAnalysisLock(cacheKey, Date.now() + 60000);
    if (!locked) {
      log.debug({ cacheKey }, "Distributed lock — polling");
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const polled = await getCachedMediaAnalysis(cacheKey);
        if (polled) {
          visionLruCache.set(cacheKey, polled);
          return polled;
        }
      }
      log.warn({ cacheKey }, "Distributed lock polling timed out");
      return FAILED_ANALYSIS_PREFIX;
    }

    // phash check
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
        phash = null;
      }
    }

    // Vision API call
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const content = await llmVision(promptText, image.image_url);
        if (content) {
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
        log.warn({ messageId }, "Vision API null response");
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
            "Vision retry",
          );
          await delay(backoffMs);
        }
      }
    }
    log.warn(
      { messageId, lastError: lastError?.message ?? "null" },
      "Vision failed after 3 attempts",
    );
    await deleteCachedMediaAnalysis(cacheKey).catch(() => {});
    return FAILED_ANALYSIS_PREFIX;
  })();

  inFlightVisionCalls.set(cacheKey, visionPromise);
  try {
    const content = await visionPromise;
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${content}`;
  } catch (outerErr) {
    log.error(
      {
        messageId,
        cacheKey,
        error: outerErr instanceof Error ? outerErr.message : String(outerErr),
      },
      "visionPromise threw unexpectedly",
    );
    return `[Media analysis for message ${messageId}] ${image.sourceLabel}: ${FAILED_ANALYSIS_PREFIX}`;
  } finally {
    inFlightVisionCalls.delete(cacheKey);
  }
};

// ---------------------------------------------------------------------------
// Media message preparation
// ---------------------------------------------------------------------------

/**
 * Download images, run vision analysis, and build the message XML block
 * for a single media-bearing message. Does NOT make the moderation LLM call.
 */
export async function prepareMediaMessage(
  target: MessageRecord,
  allAttachments: AttachmentRecord[] | undefined,
): Promise<PreparedMediaMessage> {
  const _log = createChildLogger("mediaAnalysis");
  const targetId = target.id;
  const imageMap = new Map<string, MessageImagePart[]>();
  const webTextMap = new Map<string, string[]>();
  const mediaAnalysisMap = new Map<string, string[]>();
  const maxDimension = config.AI_LLM_IMAGE_MAX_DIMENSION ?? 1024;
  const content = getAnalysisContent(target);
  const downloadPromises: Array<Promise<void>> = [];

  // Attachments
  const msgAttachments = (allAttachments ?? [])
    .filter(
      (a) =>
        a.message_id === targetId &&
        (a.uploaded_url ?? a.discord_url ?? null) &&
        (a.type.startsWith("image/") || a.type.startsWith("video/")),
    )
    .slice(0, 8);
  for (const att of msgAttachments) {
    downloadPromises.push(
      downloadAndExtractFrame(att, targetId, maxDimension, imageMap),
    );
  }

  // URLs
  const urls = extractUrlsFromText(content).slice(0, 3);
  const urlWebTexts: string[] = [];
  for (const url of urls) {
    downloadPromises.push(
      fetchUrlInline(url, targetId, maxDimension, imageMap, urlWebTexts),
    );
  }

  // Stickers, embeds, custom emoji
  const mediaEvidence = extractMessageMediaEvidence(target.metadata);
  for (const candidate of buildMediaCandidates(targetId, mediaEvidence)) {
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

  await Promise.all(downloadPromises);
  if (urlWebTexts.length > 0) webTextMap.set(targetId, urlWebTexts);

  // Vision analysis
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

  // SearXNG
  let searxngXml = "";
  const queries = extractSearchQueries(content);
  if (queries.length > 0) {
    const results = await Promise.allSettled(
      queries.map((q) => searchSearxng(q)),
    );
    const parts: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.length > 0)
        parts.push(formatSearchResults(r.value));
    }
    if (parts.length > 0)
      searxngXml = `\n<web_searches>\n${parts.join("\n")}\n</web_searches>`;
  }

  // Build XML block
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
      ? `[embed evidence: ${mediaEvidence.embeds.map((e) => [e.title, e.description, e.url, e.image, e.thumbnail].filter(Boolean).join(" | ")).join(" || ")}]`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const rep = await initializeUserReputation(target.user_id, target.guild_id);
  const profile = await getUserProfile(target.user_id);
  const refXml = await buildReferenceXml(target);

  const messageBlock = `<message id="${escapeXml(target.id)}" user="${escapeXml(target.username)}">\n  <user_reputation trust_score="${rep.trust_score}" />${profile ? `\n  <user_profile>${sanitizeAiContent(profile.profile_summary)}</user_profile>` : ""}${refXml ? `\n  ${refXml}` : ""}\n  <content>${escapeXml(content)}</content>${mediaContext ? ` ${escapeXml(mediaContext)}` : ""}${webContext}${mediaAnalysisContext}${searxngXml}\n</message>`;
  return { targetId, messageBlock };
}

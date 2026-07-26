/**
 * mediaAnalysisClient.ts
 *
 * Handles: vision analysis with multi-layer LRU/DB/phash caching,
 * image/video download, ffmpeg frame extraction, and media message
 * preparation for the LLM moderation pipeline.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createChildLogger } from "@bete/shared/logger";
import { createAbortControllerWithTimeout, delay } from "@bete/shared/utils";
import { LRUCache } from "lru-cache";
import { config } from "../../shared/config/config.js";
import { resizeImageForVision } from "../attachment-upload/imageResizer.js";
import { extractMessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type {
  AttachmentRecord,
  MessageRecord,
} from "../message-capture/types.js";
import { sniffImageMimeType } from "./imageMimeSniffer.js";
import { llmVision } from "./llmClient.js";
import {
  buildReferenceXml,
  escapeXml,
  getAnalysisContent,
} from "./moderationBuilders.js";
import { sanitizeAiContent } from "./moderationPrompt.js";
import {
  extractSearchQueries,
  formatSearchResults,
  searchSearxng,
} from "./searxngSearch.js";
import {
  getStickerFromCache,
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
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
  upsertCachedMediaByPhash,
} from "./textCacheStore.js";
import { extractUrlsFromText, fetchUrlSafely } from "./urlFetcher.js";
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

interface MediaCandidate {
  messageId: string;
  url: string;
  label: string;
  stickerName?: string;
  customEmojiId?: string;
  customEmojiName?: string;
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
const visionLruCache = new LRUCache<string, string>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000,
});
const inFlightVisionCalls = new Map<string, Promise<string>>();
const FAILED_ANALYSIS_PREFIX =
  "GAGAL DIANALISIS — gambar tidak dapat diunduh atau vision API gagal setelah 3x percobaan. JANGAN mengasumsikan gambar aman hanya karena gagal dianalisis. Gunakan metadata URL/nama file saja sebagai petunjuk.";

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------
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

function buildMediaCandidates(
  messageId: string,
  evidence: ReturnType<typeof extractMessageMediaEvidence>,
): MediaCandidate[] {
  return [
    ...evidence.stickers
      .filter((s) => s.url)
      .map(
        (s): MediaCandidate => ({
          messageId,
          url: s.url,
          label: `[gambar di atas adalah sticker "${s.name}" dari pesan id=${messageId}]`,
          stickerName: s.name,
        }),
      ),
    ...evidence.embeds.flatMap((embed): MediaCandidate[] =>
      [
        embed.image
          ? ({
              messageId,
              url: embed.image,
              label: `[gambar di atas berasal dari embed image pada pesan id=${messageId}]`,
            } as MediaCandidate)
          : null,
        embed.thumbnail
          ? ({
              messageId,
              url: embed.thumbnail,
              label: `[gambar di atas berasal dari embed thumbnail pada pesan id=${messageId}]`,
            } as MediaCandidate)
          : null,
      ].filter((c): c is MediaCandidate => c !== null),
    ),
    ...evidence.customEmojis.map(
      (emoji): MediaCandidate => ({
        messageId,
        url: emoji.url,
        label: `[gambar di atas adalah custom emoji "${emoji.name}" dari pesan id=${messageId}]`,
        customEmojiId: emoji.id,
        customEmojiName: emoji.name,
      }),
    ),
  ];
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
// Download helpers
// ---------------------------------------------------------------------------

async function downloadSingleAttachment(
  att: AttachmentRecord,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
): Promise<void> {
  const log = createChildLogger("mediaAnalysis");
  const urlToUse = att.uploaded_url ?? att.discord_url ?? null;
  if (!urlToUse) return;

  const { controller, clear } = createAbortControllerWithTimeout(15000);
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

    if (!sniffedMime && att.type.startsWith("video/")) {
      await extractVideoFrames(
        att,
        imageBytes,
        targetId,
        maxDimension,
        imageMap,
      );
      return;
    }

    // Fallback: try attachment type metadata, then filename extension
    let resolvedMime = sniffedMime;
    if (!resolvedMime) {
      if (att.type.startsWith("image/")) {
        resolvedMime = att.type;
        log.warn(
          { attachmentId: att.id, filename: att.filename, type: att.type },
          "Image MIME sniff failed — using attachment metadata type as fallback",
        );
      } else {
        // Last resort: check file extension
        const ext = att.filename?.toLowerCase().split(".").pop();
        if (ext && ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) {
          const mimeMap: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            gif: "image/gif",
            webp: "image/webp",
            bmp: "image/bmp",
          };
          resolvedMime = mimeMap[ext];
          log.warn(
            { attachmentId: att.id, filename: att.filename, ext },
            "Image MIME sniff failed — using file extension fallback",
          );
        }
      }
    }

    // If all fallbacks fail, still try with generic image/jpeg (better than silent skip)
    if (!resolvedMime) {
      resolvedMime = "image/jpeg";
      log.warn(
        { attachmentId: att.id, filename: att.filename },
        "All MIME detection failed — forcing image/jpeg as last resort",
      );
    }

    const { data: resizedBuffer, mimeType: resizedMime } =
      await resizeImageForVision(imageBytes, maxDimension);
    const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
    addImageToMap(imageMap, targetId, {
      type: "image_url",
      image_url: { url: dataUrl },
      sourceLabel: `[gambar di atas adalah attachment ${att.filename} dari pesan id=${att.message_id}]`,
    });
  } catch (err) {
    log.warn(
      {
        attachmentId: att.id,
        error: err instanceof Error ? err.message : String(err),
      },
      "Download failed",
    );
  } finally {
    clear();
  }
}

async function extractVideoFrames(
  att: AttachmentRecord,
  videoBytes: Buffer,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
): Promise<void> {
  const log = createChildLogger("mediaAnalysis");
  const execFileAsync = promisify(execFile);
  const tmpDir = await mkdtemp(path.join(tmpdir(), "bete-video-"));
  const inputPath = path.join(tmpDir, att.filename || "video.mp4");
  const outputPattern = path.join(tmpDir, "frame-%03d.jpg");
  try {
    await writeFile(inputPath, videoBytes);
    const { stdout: durationStr } = await execFileAsync(
      "/usr/bin/ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        inputPath,
      ],
      { timeout: 10000 },
    );
    const duration = parseFloat(durationStr.trim()) || 1;
    const fps = (3 / duration).toFixed(6);
    await execFileAsync(
      "/usr/bin/ffmpeg",
      [
        "-i",
        inputPath,
        "-vf",
        `fps=${fps}`,
        "-frames:v",
        "4",
        "-vsync",
        "vfr",
        "-q:v",
        "2",
        outputPattern,
      ],
      { timeout: 30000 },
    );
    for (let i = 1; i <= 4; i++) {
      try {
        const framePath = path.join(
          tmpDir,
          `frame-${String(i).padStart(3, "0")}.jpg`,
        );
        const frameBytes = await readFile(framePath);
        const { data: resizedBuffer, mimeType: resizedMime } =
          await resizeImageForVision(frameBytes, maxDimension);
        const dataUrl = `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`;
        addImageToMap(imageMap, targetId, {
          type: "image_url",
          image_url: { url: dataUrl },
          sourceLabel: `[frame ${i}/4 dari video ${att.filename} (attachment), pesan id=${att.message_id}]`,
        });
      } catch {
        /* skip */
      }
    }
    log.info({ attachmentId: att.id }, "Video frames extracted");
  } catch (ffmpegErr) {
    log.warn(
      {
        attachmentId: att.id,
        error:
          ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr),
      },
      "ffmpeg failed",
    );
  } finally {
    try {
      await unlink(inputPath);
    } catch {
      /* ignore */
    }
    for (let i = 1; i <= 4; i++) {
      try {
        await unlink(
          path.join(tmpDir, `frame-${String(i).padStart(3, "0")}.jpg`),
        );
      } catch {
        /* ignore */
      }
    }
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function downloadMediaCandidate(
  candidate: MediaCandidate,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
  mediaAnalysisMap: Map<string, string[]>,
): Promise<void> {
  const _log = createChildLogger("mediaAnalysis");
  if ((imageMap.get(targetId)?.length ?? 0) >= 8) return;

  if (candidate.customEmojiId || candidate.stickerName) {
    const vck = candidate.customEmojiId
      ? makeCustomEmojiCacheKey(candidate.customEmojiId)
      : makeStickerCacheKey(candidate.stickerName!);
    const cached = await getCachedMediaAnalysis(vck);
    if (cached) {
      const existing = mediaAnalysisMap.get(targetId) ?? [];
      existing.push(
        `[Media analysis for message ${candidate.messageId}] ${candidate.label}: ${cached}`,
      );
      mediaAnalysisMap.set(targetId, existing);
      // Warm the LRU cache so subsequent calls in the same process skip DB query
      visionLruCache.set(vck, cached);
      return;
    }
  }

  if (candidate.stickerName && isStickerCacheReady()) {
    try {
      const cached = await getStickerFromCache(candidate.stickerName);
      if (cached?.imageUrl) {
        addImageToMap(imageMap, targetId, {
          type: "image_url",
          image_url: { url: cached.imageUrl },
          sourceLabel: candidate.label,
          stickerName: candidate.stickerName,
        });
        return;
      }
    } catch {
      /* fall through */
    }
  }

  const result = await fetchUrlSafely(candidate.url);
  if (result.type !== "image" || !result.data || !result.mimeType) return;
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
  addImageToMap(imageMap, targetId, {
    type: "image_url",
    image_url: { url: `data:${resizedMime};base64,${base64}` },
    sourceLabel: candidate.label,
    stickerName: candidate.stickerName,
    customEmojiId: candidate.customEmojiId,
    customEmojiName: candidate.customEmojiName,
  });
}

async function fetchUrlInline(
  url: string,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
  webTexts: string[],
): Promise<void> {
  const result = await fetchUrlSafely(url);
  if (result.type === "image" && result.data && result.mimeType) {
    const { data: resizedBuffer, mimeType: resizedMime } =
      await resizeImageForVision(result.data, maxDimension);
    addImageToMap(imageMap, targetId, {
      type: "image_url",
      image_url: {
        url: `data:${resizedMime};base64,${resizedBuffer.toString("base64")}`,
      },
      sourceLabel: `[gambar dari URL ${url} (inline), pesan id=${targetId}]`,
    });
  } else if (result.type === "text" && result.textContent) {
    webTexts.push(
      `<web_content url="${escapeXml(url)}">${escapeXml(result.textContent.slice(0, 2000))}</web_content>`,
    );
  }
}

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
      downloadSingleAttachment(att, targetId, maxDimension, imageMap),
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

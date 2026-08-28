/**
 * mediaDownloader.ts
 *
 * Downloads image/video attachments, extracts video frames via ffmpeg,
 * handles temp-file cleanup, and resolves stickers/embeds/custom-emoji
 * URLs into resized data-URIs for vision analysis.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createChildLogger } from "@/shared/logger/index";
import { createAbortControllerWithTimeout } from "@/shared/utils/index";
import { resizeImageForVision } from "../attachment-upload/imageResizer.js";
import type { MessageMediaEvidence } from "../message-capture/messageMetadata.js";
import type { AttachmentRecord } from "../message-capture/types.js";
import {
  getCachedMediaAnalysis,
  makeCustomEmojiCacheKey,
  makeStickerCacheKey,
  visionLruCache,
} from "./mediaCache.js";
import { escapeXml } from "./moderationBuilders.js";
import {
  getStickerFromCache,
  isStickerCacheReady,
  uploadAndCacheSticker,
} from "./stickerCache.js";
import { fetchUrlSafely } from "./urlFetcher.js";
import type { MessageImagePart } from "./visionAnalyzer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MediaCandidate {
  messageId: string;
  url: string;
  label: string;
  stickerName?: string;
  customEmojiId?: string;
  customEmojiName?: string;
}

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

/**
 * Build media candidates (stickers, embeds, custom emojis) from message
 * metadata evidence.
 */
export function buildMediaCandidates(
  messageId: string,
  evidence: MessageMediaEvidence,
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
// MIME type sniffer
// ---------------------------------------------------------------------------

/**
 * Sniff the first bytes of a buffer to determine if it is a supported image
 * format. Returns the canonical MIME type string on success, or null if the
 * bytes are not a recognizable image.
 */
export function sniffImageMimeType(buf: Buffer): string | null {
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
// Video frame extraction
// ---------------------------------------------------------------------------
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
      "ffprobe",
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
      "ffmpeg",
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

// ---------------------------------------------------------------------------
// Download + extract frame
// ---------------------------------------------------------------------------

/**
 * Download a single attachment, resize it for vision analysis,
 * or extract frames if it is a video.
 */
export async function downloadAndExtractFrame(
  att: AttachmentRecord,
  targetId: string,
  maxDimension: number,
  imageMap: Map<string, MessageImagePart[]>,
): Promise<void> {
  const log = createChildLogger("mediaAnalysis");
  // Analysis now uses the Discord CDN URL directly (uploaded_url is archive-only).
  // Try discord_url first; fall back to uploaded_url (Tele proxy) if the CDN
  // link returns a non-OK response (expired/purged).
  const urlCandidates = [
    att.discord_url,
    att.uploaded_url && att.uploaded_url !== att.discord_url
      ? att.uploaded_url
      : null,
  ].filter((u): u is string => Boolean(u));
  if (urlCandidates.length === 0) return;

  let imageBytes: Buffer | null = null;
  let lastStatus = 0;
  let lastError: string | null = null;
  for (const urlToUse of urlCandidates) {
    const { controller, clear } = createAbortControllerWithTimeout(15000);
    try {
      const res = await fetch(urlToUse, { signal: controller.signal });
      if (!res.ok || !res.body) {
        lastStatus = res.status;
        log.warn(
          {
            attachmentId: att.id,
            urlHost: new URL(urlToUse).host,
            status: res.status,
          },
          "Attachment fetch non-OK — trying next URL",
        );
        continue;
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
            reader.cancel();
            return;
          }
          chunks.push(value);
        }
      }
      imageBytes = Buffer.concat(chunks);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(
        {
          attachmentId: att.id,
          urlHost: new URL(urlToUse).host,
          error: lastError,
        },
        "Attachment download failed — trying next URL",
      );
    } finally {
      clear();
    }
  }

  if (!imageBytes) {
    log.warn(
      {
        attachmentId: att.id,
        filename: att.filename,
        lastStatus,
        lastError,
      },
      "All attachment URLs failed — skipping media analysis",
    );
    return;
  }

  const sniffedMime = sniffImageMimeType(imageBytes);

  if (!sniffedMime && att.type.startsWith("video/")) {
    await extractVideoFrames(att, imageBytes, targetId, maxDimension, imageMap);
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

  // If all fallbacks fail, still try with generic image/jpeg
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
}

// ---------------------------------------------------------------------------
// Media candidate download
// ---------------------------------------------------------------------------

/**
 * Download a media candidate (sticker, embed image, custom emoji),
 * checking caches first to avoid redundant fetches.
 */
export async function downloadMediaCandidate(
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
      : makeStickerCacheKey(candidate.stickerName ?? "");
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

// ---------------------------------------------------------------------------
// Inline URL fetch
// ---------------------------------------------------------------------------

/**
 * Fetch an inline URL — if it is an image, resize and add to the image map;
 * if it is text, collect it as web context.
 */
export async function fetchUrlInline(
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
    const titleAttr = result.title ? ` title="${escapeXml(result.title)}"` : "";
    webTexts.push(
      `<web_content url="${escapeXml(url)}"${titleAttr}>${escapeXml(result.textContent.slice(0, 2000))}</web_content>`,
    );
  }
}

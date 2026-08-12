/**
 * mediaAnalysisClient.ts — barrel re-export
 *
 * Re-exports from mediaCache, mediaDownloader, and visionAnalyzer
 * for backward compatibility with existing imports.
 */
export {
  acquireMediaAnalysisLock,
  deleteCachedMediaAnalysis,
  getCachedMediaAnalysis,
  setCachedMediaAnalysis,
} from "./mediaCache.js";
export {
  downloadAndExtractFrame,
  sniffImageMimeType,
} from "./mediaDownloader.js";
export {
  analyzeSingleMediaImage,
  hasMediaContent,
  MessageImagePart,
  PreparedMediaMessage,
  prepareMediaMessage,
} from "./visionAnalyzer.js";

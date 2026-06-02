import sharp from "sharp";
import { createChildLogger } from "@bete/shared/logger";

const log = createChildLogger("imageResizer");

/**
 * Resize an image buffer for optimal vision LLM analysis.
 *
 * - Resizes to maxDim x maxDim maintaining aspect ratio
 * - Converts to JPEG at quality 85 for size reduction
 * - Falls back to original buffer if sharp fails
 *
 * @param buf - Raw image buffer
 * @param maxDim - Maximum dimension in pixels (default 1024)
 * @returns Resized buffer with detected MIME type
 */
export async function resizeImageForVision(
  buf: Buffer,
  maxDim = 1024,
): Promise<{ data: Buffer; mimeType: string }> {
  try {
    const metadata = await sharp(buf).metadata();
    const inputFormat = metadata.format ?? "jpeg";

    // Skip resize if already smaller than maxDim
    if ((metadata.width ?? 0) <= maxDim && (metadata.height ?? 0) <= maxDim) {
      return { data: buf, mimeType: `image/${inputFormat}` };
    }

    const resized = await sharp(buf)
      .resize(maxDim, maxDim, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    log.debug(
      {
        originalSize: buf.length,
        resizedSize: resized.length,
        reductionPct: Math.round(
          ((buf.length - resized.length) / buf.length) * 100,
        ),
      },
      "Image resized for vision analysis",
    );

    return { data: resized, mimeType: "image/jpeg" };
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Image resize failed — using original buffer",
    );
    // Fallback: return original buffer with best-effort MIME type
    return { data: buf, mimeType: "image/jpeg" };
  }
}

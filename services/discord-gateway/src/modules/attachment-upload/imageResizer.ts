import { createChildLogger } from "@bete/shared/logger";
import sharp from "sharp";

const log = createChildLogger("imageResizer");

/**
 * Prepare an image buffer for optimal vision LLM analysis.
 *
 * - Resizes to maxDim x maxDim maintaining aspect ratio (only if larger)
 * - Converts to PNG (lossless) to preserve full image detail
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

    // Skip resize entirely if already within max dimension
    if ((metadata.width ?? 0) <= maxDim && (metadata.height ?? 0) <= maxDim) {
      return { data: buf, mimeType: `image/${inputFormat}` };
    }

    // Resize dimension only — convert to PNG lossless to preserve detail
    const resized = await sharp(buf)
      .resize(maxDim, maxDim, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    log.debug(
      {
        originalSize: buf.length,
        originalFormat: inputFormat,
        resizedSize: resized.length,
        reductionPct: Math.round(
          ((buf.length - resized.length) / buf.length) * 100,
        ),
      },
      "Image resized for vision analysis (lossless PNG)",
    );

    return { data: resized, mimeType: "image/png" };
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Image resize failed — using original buffer",
    );
    // Fallback: return original buffer with best-effort MIME type
    return { data: buf, mimeType: "image/jpeg" };
  }
}

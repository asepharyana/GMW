import sharp from "sharp";
import { createChildLogger } from "@/shared/logger/index";

const log = createChildLogger("imageResizer");

/**
 * Prepare an image buffer for vision LLM analysis.
 *
 * - Resizes to maxDim x maxDim maintaining aspect ratio WITHOUT upscaling
 *   (small images such as stickers/emojis are passed through at original size,
 *   just re-encoded)
 * - Encodes as JPEG (lossy, quality ~85). Photos compress VERY poorly in
 *   lossless PNG — a 1024px Facebook photo balloons to multi-MB PNG base64 that
 *   the vision model silently rejects (empty response → "Vision API null").
 *   JPEG keeps the same photo at ~100–400KB, which the model processes fine and
 *   stays well below request/token size limits.

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

    // Always (re-)encode to JPEG and fit inside maxDim without upscaling.
    // Skipping the encode for already-small images left raw originals in
    // their native (often lossless PNG or full-quality) form, which could
    // still bloat data URLs and trip the vision model's size limit.
    const resized = await sharp(buf)
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const inputFormat = metadata.format ?? "jpeg";
    log.debug(
      {
        originalSize: buf.length,
        originalFormat: inputFormat,
        resizedSize: resized.length,
        reductionPct: Math.round(
          ((buf.length - resized.length) / buf.length) * 100,
        ),
      },
      "Image resized for vision analysis (JPEG)",
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

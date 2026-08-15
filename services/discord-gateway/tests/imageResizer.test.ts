import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { resizeImageForVision } from "../src/modules/attachment-upload/imageResizer.js";

// Build a worst-case (poorly-compressing) 1024x1024 image, like a real photo.
async function makeNoisyBuffer(): Promise<Buffer> {
  const w = 1024,
    h = 1024;
  const buf = Buffer.alloc(w * h * 3);
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(rnd() * 256);
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

describe("resizeImageForVision — vision input encoding", () => {
  it("always encodes to JPEG (not lossless PNG)", async () => {
    const src = await makeNoisyBuffer();
    // Source PNG is large & lossless (the old failure mode)
    expect(src.length).toBeGreaterThan(300_000);

    const { data, mimeType } = await resizeImageForVision(src, 1024);
    expect(mimeType).toBe("image/jpeg");
    // JPEG encoding must shrink the data URL payload well below MB range.
    expect(data.length).toBeLessThan(800_000);
  });

  it("re-encodes already-small images (no passthrough of raw originals)", async () => {
    const small = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const { data, mimeType } = await resizeImageForVision(small, 1024);
    expect(mimeType).toBe("image/jpeg");
    // Even a tiny PNG must come out re-encoded (bounded), not the raw PNG bytes.
    expect(data.length).toBeLessThan(small.length);
  });
});

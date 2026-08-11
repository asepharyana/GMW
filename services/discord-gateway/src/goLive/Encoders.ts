/**
 * Lightweight encoders config — ported from @dank074/discord-video-stream
 * encoders/software.js. Only software (libx264) is needed for GoLive.
 */

export interface EncoderSettings {
  name: string;
  options: string[];
  outFilters?: string[];
  globalOptions?: string[];
}

export interface EncoderSet {
  H264: EncoderSettings;
  H265: EncoderSettings;
  VP8: EncoderSettings;
  VP9: EncoderSettings;
  AV1: EncoderSettings;
}

/** Software x264 encoder. Matches @dank074's software() defaults. */
export function software(
  opts: {
    x264?: { preset?: string; tune?: string };
    x265?: { preset?: string; tune?: string };
  } = {},
): () => EncoderSet {
  const { x264, x265 } = opts;
  const { preset: x264Preset = "superfast", tune: x264Tune = "film" } =
    x264 ?? {};
  const { preset: x265Preset = "superfast", tune: x265Tune } = x265 ?? {};
  return () => ({
    H264: {
      name: "libx264",
      options: ["-forced-idr 1", `-tune ${x264Tune}`, `-preset ${x264Preset}`],
    },
    H265: {
      name: "libx265",
      options: [
        "-forced-idr 1",
        ...(x265Tune ? [`-tune ${x265Tune}`] : []),
        `-preset ${x265Preset}`,
      ],
    },
    VP8: { name: "libvpx", options: ["-deadline 20000"] },
    VP9: { name: "libvpx-vp9", options: ["-deadline 20000"] },
    AV1: { name: "libsvtav1", options: [] },
  });
}

export const Encoders = { software };

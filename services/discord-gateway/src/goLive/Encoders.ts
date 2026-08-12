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
  const { preset: x264Preset = "superfast", tune: x264Tune = "zerolatency" } =
    x264 ?? {};
  const { preset: x265Preset = "superfast", tune: x265Tune } = x265 ?? {};
  return () => ({
    H264: {
      name: "libx264",
      // -profile:v baseline is REQUIRED: the SDP advertises
      // profile-level-id=42e01f (constrained baseline) and Discord's
      // receiver decodes with that profile. x264's default is High — a
      // High-profile bitstream against a baseline SDP negotiation fails to
      // decode → black GoLive tile (production bug, fixed 2026-08-12).
      // zerolatency matches @dank074 (no lookahead — correct for live).
      options: [
        "-forced-idr 1",
        "-profile:v baseline",
        // repeat-headers: SPS/PPS inline BEFORE EVERY IDR, not just the
        // first. Required for the NUT container path (NUT stores extradata
        // in the header and `-c:v copy` remux loses it → decoder sees
        // "non-existing PPS 0 referenced" → no picture) and lets Discord's
        // decoder recover after any PLI/keyframe request mid-stream.
        "-x264-params",
        "repeat-headers=1",
        `-tune ${x264Tune}`,
        `-preset ${x264Preset}`,
      ],
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

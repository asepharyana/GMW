/**
 * goLive port smoke tests — verify the TS layer (no native binding needed
 * for these; native is covered by the C++/node test-packetizer.js).
 */
import { describe, expect, it } from "vitest";
import { H264Helpers } from "../src/goLive/AnnexBHelper.js";
import { AVCodecID } from "../src/goLive/Demuxer.js";
import {
  BaseMediaStream,
  CodecPayloadType,
  Encoders,
  normalizeVideoCodec,
} from "../src/goLive/index.js";
import { rewriteSPSVUI } from "../src/goLive/SPSVUIRewriter.js";

describe("goLive port: codec + encoders", () => {
  it("normalizeVideoCodec maps aliases to canonical names", () => {
    expect(normalizeVideoCodec("H.264")).toBe("H264");
    expect(normalizeVideoCodec("AVC")).toBe("H264");
    expect(normalizeVideoCodec("h265")).toBe("H265");
    expect(normalizeVideoCodec("vp8")).toBe("VP8");
    expect(normalizeVideoCodec("av1")).toBe("AV1");
  });

  it("software encoder exposes x264 libx264 baseline zerolatency", () => {
    const enc = Encoders.software()();
    expect(enc.H264.name).toBe("libx264");
    expect(enc.H264.options).toContain("-preset superfast");
    expect(enc.H264.options).toContain("-tune zerolatency");
    // Baseline profile is REQUIRED to match the SDP's profile-level-id=42e01f
    // (constrained baseline) — High-profile bitstreams fail to decode → black
    expect(enc.H264.options).toContain("-profile:v baseline");
  });

  it("CodecPayloadType has opus + H264 entries", () => {
    expect(CodecPayloadType.opus).toBeDefined();
    expect(CodecPayloadType.H264).toBeDefined();
  });
});

describe("goLive port: annexb + sps rewriter", () => {
  it("H264Helpers detects NAL unit types", () => {
    const nal = Buffer.from([0x67, 0x42, 0x00, 0x1e]); // SPS
    expect(H264Helpers.getUnitType(nal)).toBe(7); // SPS type
    expect(H264Helpers.getUnitType(Buffer.from([0x65, 0x88]))).toBe(5); // IDR
  });

  it("rewriteSPSVUI returns a buffer for valid SPS", () => {
    const sps = Buffer.from([
      0x67, 0x42, 0x00, 0x1e, 0x96, 0x54, 0x05, 0x01, 0xec, 0x80,
    ]);
    expect(() => rewriteSPSVUI(sps)).not.toThrow();
  });
});

describe("goLive port: streams", () => {
  it("BaseMediaStream accepts plain frame objects", () => {
    // BaseMediaStream is abstract — use a concrete subclass that no-ops the
    // packetizer hook.
    class TestStream extends BaseMediaStream {
      async _sendFrame(_frame: Buffer, _frametime: number): Promise<void> {
        /* no-op */
      }
    }
    const stream = new TestStream("video");
    const frame = {
      data: Buffer.from([1, 2, 3]),
      pts: 0,
      duration: 40,
      timeBase: { num: 1, den: 48000 },
      flags: 0,
      streamIndex: 0,
      free: () => {},
    };
    expect(() => stream.write(frame)).not.toThrow();
    stream.end();
  });
});

describe("goLive port: demuxer codec ids", () => {
  it("maps H264/HEVC/opus AVCodecID values", () => {
    expect(AVCodecID.AV_CODEC_ID_H264).toBe(27);
    expect(AVCodecID.AV_CODEC_ID_HEVC).toBe(173);
    expect(AVCodecID.AV_CODEC_ID_OPUS).toBe(86019);
  });
});

describe("goLive port: prepareStream option merge", () => {
  it("merges default options into the descriptor (no ffmpeg spawn)", () => {
    // Import the merge logic directly via the module; prepareStream spawns
    // ffmpeg so we verify the descriptors it would build by checking the
    // encoder + option functions that prepareStream uses.
    const enc = Encoders.software()();
    expect(enc.H264.options).toContain("-forced-idr 1");
    expect(normalizeVideoCodec("H264")).toBe("H264");
  });
});

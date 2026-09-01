import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SSRCMap } from "@discordjs/voice";
import {
  H264Depacketizer,
  muxToMp4,
} from "../src/modules/voice-recording/videoReceiver.js";

// Build a single-NAL RTP payload: [NAL header, ...data]
function singleNal(nalHeader: number, data: number[] = []): Buffer {
  return Buffer.from([nalHeader, ...data]);
}

describe("H264Depacketizer", () => {
  it("prefixes a single NAL with an AnnexB start code once config seen", () => {
    const d = new H264Depacketizer();
    // SPS first (0x67 = nal ref idc 3, type 7)
    const sps = d.push(singleNal(0x67, [1, 2, 3]));
    expect(sps.length).toBe(1);
    expect(sps[0].subarray(0, 4)).toEqual(Buffer.from([0, 0, 0, 1]));
    expect(sps[0][4]).toBe(0x67); // start code + original NAL
  });

  it("drops NALs before seeing SPS/PPS/IDR (waits for a keyframe)", () => {
    const d = new H264Depacketizer();
    // A non-IDR slice (type 1) before any config → dropped
    const res = d.push(singleNal(0x21, [9, 9, 9]));
    expect(res.length).toBe(0);
  });

  it("emits frames after config", () => {
    const d = new H264Depacketizer();
    d.push(singleNal(0x67, [])); // SPS
    const slice = d.push(singleNal(0x65, [1, 2, 3, 4])); // IDR (type 5)
    expect(slice.length).toBe(1);
    expect(slice[0].equals(Buffer.from([0, 0, 0, 1, 0x65, 1, 2, 3, 4]))).toBe(
      true,
    );
  });

  it("reassembles FU-A fragments into one NAL", () => {
    const d = new H264Depacketizer();
    d.push(singleNal(0x67, [])); // SPS config
    // FU-A: payload[0]=FU indicator (0x7C=type28), payload[1]=FU header
    // start fragment: S=1 E=0, NAL type 5 => 0x85 ; data [10, 11]
    const start = Buffer.from([0x7c, 0x85, 10, 11]);
    const middle = Buffer.from([0x7c, 0x05, 12, 13]);
    const end = Buffer.from([0x7c, 0x45, 14, 15]); // E=1

    expect(d.push(start).length).toBe(0); // not complete yet
    expect(d.push(middle).length).toBe(0);
    const final = d.push(end);
    expect(final.length).toBe(1);
    // NAL header reconstructed as (0x7C & 0xE0) | 5 = 0x65, then data 10..15
    expect(
      final[0].equals(Buffer.from([0, 0, 0, 1, 0x65, 10, 11, 12, 13, 14, 15])),
    ).toBe(true);
  });

  it("first fragment of a burst with unknown start is dropped gracefully", () => {
    const d = new H264Depacketizer();
    d.push(singleNal(0x67, [])); // SPS
    // A continuation fragment with no buffer → ignored, no crash
    const orphan = Buffer.from([0x7c, 0x05, 99]); // S=0
    expect(d.push(orphan).length).toBe(0);
  });
});

describe("muxToMp4", () => {
  it("remuxes a raw h264 file into a playable mp4 and deletes the raw file", async () => {
    // Skip if ffmpeg is unavailable (headless Nix-less CI).
    let ffmpegOk = true;
    try {
      execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    } catch {
      ffmpegOk = false;
    }
    if (!ffmpegOk) {
      return;
    }

    const dir = mkdtempSync(path.join(tmpdir(), "gmw-video-"));
    const raw = path.join(dir, "clip.h264");
    try {
      execFileSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=duration=1:size=320x240:rate=10",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-profile:v",
          "baseline",
          "-pix_fmt",
          "yuv420p",
          "-f",
          "h264",
          "-y",
          raw,
        ],
        { stdio: "ignore" },
      );

      const mp4 = await muxToMp4(raw);
      expect(mp4).toBe(path.join(dir, "clip.mp4"));
      // raw file deleted, mp4 exists and is non-empty
      await expect(access(raw)).rejects.toThrow();
      const s = await stat(mp4);
      expect(s.size).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Fork @discordjs/voice patch tests (video receive support) ─────────────
// These assert the behavior added in vendor/discord-voice-fork:
//  1. SSRCMap.update() accepts videoSSRC and get() resolves video SSRCs
//  2. The op-12 Speaking handler maps streams[].ssrc → videoSSRC
describe("discord-voice-fork videoSSRC", () => {
  it("registers a videoSSRC and get() resolves it from the video SSRC", () => {
    const map = new SSRCMap();
    // Simulates what the fork's onWsPacket(op 12) does:
    // ssrcMap.update({ userId, audioSSRC, videoSSRC })
    map.update({ userId: "user-1", audioSSRC: 1001, videoSSRC: 2001 });

    // Audio path unchanged: get by audioSSRC
    expect(map.get(1001)?.userId).toBe("user-1");
    // Video path (fork): get by videoSSRC resolves to the same user
    expect(map.get(2001)?.userId).toBe("user-1");
    expect(map.get(2001)?.videoSSRC).toBe(2001);
  });

  it("emits create event with videoSSRC for videoReceiver attribution", () => {
    const map = new SSRCMap();
    const seen: Array<{ userId: string; videoSSRC?: number }> = [];
    map.on("create", (data) => seen.push(data));

    map.update({ userId: "user-2", audioSSRC: 1002, videoSSRC: 2002 });

    expect(seen).toHaveLength(1);
    expect(seen[0].videoSSRC).toBe(2002);
    // videoReceiver.ts hooks this event to build videoSsrcToUser
    expect(seen[0].userId).toBe("user-2");
  });

  it("keeps audio-only behavior when no videoSSRC present", () => {
    const map = new SSRCMap();
    map.update({ userId: "user-3", audioSSRC: 1003 });

    expect(map.get(1003)?.userId).toBe("user-3");
    // No videoSSRC → get by a random SSRC returns undefined (no false match)
    expect(map.get(2003)).toBeUndefined();
  });
});

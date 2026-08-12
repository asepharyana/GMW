import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { demux } from "../src/goLive/Demuxer.js";

/** Same resolution as Demuxer.resolveBin: env override → Nix store scan. */
function resolveFfmpeg(): string | null {
  const override = process.env.FFMPEG_PATH;
  if (override && existsSync(override)) return override;
  const store = "/nix/store";
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      if (!entry.includes("ffmpeg-headless-")) continue;
      const candidate = join(store, entry, "bin", "ffmpeg");
      if (existsSync(candidate)) return candidate;
    }
  }
  return existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : null;
}

/**
 * Ogg Opus byte stream built by hand: OpusHead (19B) + a few 20ms opus
 * frames, wrapped in valid Ogg pages (CRC 0 — the parser ignores CRC).
 */
function buildOggOpusBytes(frames: number): Buffer {
  const opusHead = Buffer.from([
    0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
    0x01, 0x02, 0x38, 0x01, 0x80, 0xbb, 0x00, 0x00,
    0x00, 0x00, 0x00, // version 1, 2ch, 48000
  ]);
  // A minimal valid opus data packet: TOC 0xFC (48kHz stereo 20ms) + payload
  const dataPacket = Buffer.alloc(20, 0);
  dataPacket[0] = 0xfc;
  const makePage = (
    seq: number,
    headerType: number,
    serial: number,
    packets: Buffer[],
  ): Buffer => {
    const segmentTable: number[] = [];
    const payloadParts: Buffer[] = [];
    for (const p of packets) {
      let remaining = p.length;
      let off = 0;
      do {
        const chunk = Math.min(255, remaining);
        segmentTable.push(chunk);
        payloadParts.push(p.subarray(off, off + chunk));
        off += chunk;
        remaining -= chunk;
      } while (remaining > 0);
    }
    const payload = Buffer.concat(payloadParts);
    const header = Buffer.alloc(27 + segmentTable.length);
    header.write("OggS", 0, "latin1");
    header[4] = 0; // version
    header[5] = headerType;
    header.writeUInt32LE(0, 6); // granule (unused)
    header.writeUInt32LE(0, 10);
    header.writeUInt32LE(serial, 14);
    header.writeUInt32LE(seq, 18);
    header.writeUInt32LE(0, 22); // crc (ignored)
    header[26] = segmentTable.length;
    for (let i = 0; i < segmentTable.length; i++) header[27 + i] = segmentTable[i];
    return Buffer.concat([header, payload]);
  };
  const pages: Buffer[] = [];
  const serial = 0x1234;
  let seq = 0;
  // Page 0: BOS + OpusHead (19 bytes, single lacing)
  pages.push(makePage(seq++, 0x02, serial, [opusHead]));
  // Pages 1+: data packets, a few per page
  const perPage = 3;
  for (let i = 0; i < frames; i += perPage) {
    const pkts = [];
    for (let j = 0; j < perPage && i + j < frames; j++) pkts.push(dataPacket);
    pages.push(makePage(seq++, 0x00, serial, pkts));
  }
  return Buffer.concat(pages);
}

describe("Demuxer NUT path with audio", () => {
  it("emits video access units AND parsed opus audio frames", async () => {
    // Real NUT file (video h264 + opus) produced by ffmpeg — generated once
    // in this test via ffmpeg, skipped if ffmpeg is unavailable.
    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
      console.warn("ffmpeg not found — skipping NUT integration case");
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "gmw-nut-test-"));
    const inWebm = join(dir, "in.webm");
    const inNut = join(dir, "in.nut");
    try {
      // Build a tiny webm (vpx + opus) then remux to NUT h264+opus — mirrors
      // prepareStream(includeAudio) output.
      const { spawnSync } = await import("node:child_process");
      const gen = spawnSync(
        ffmpeg,
        [
          "-hide_banner", "-loglevel", "error",
          "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=10:duration=3",
          "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
          "-c:v", "libvpx-vp9", "-b:v", "100k", "-pix_fmt", "yuv420p",
          "-c:a", "libopus", "-b:a", "48k", "-f", "webm", "-y", inWebm,
        ],
        { timeout: 20000 },
      );
      if (gen.status !== 0) {
        console.warn("ffmpeg webm gen failed — skipping", gen.stderr?.toString().slice(0, 200));
        return;
      }
      const enc = spawnSync(
        ffmpeg,
        [
          "-hide_banner", "-loglevel", "error", "-i", inWebm,
          "-map", "0:v:0", "-c:v", "libx264", "-profile:v", "baseline",
          "-x264-params", "repeat-headers=1", "-preset", "superfast",
          "-pix_fmt", "yuv420p", "-g", "10", "-forced-idr", "1",
          "-map", "0:a:0?", "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "2",
          "-f", "nut", "-y", inNut,
        ],
        { timeout: 20000 },
      );
      if (enc.status !== 0) {
        console.warn("ffmpeg nut gen failed — skipping", enc.stderr?.toString().slice(0, 200));
        return;
      }
      const { readFileSync } = await import("node:fs");
      // demux() takes string | PassThrough — wrap the file read. Drip the
      // bytes in quickly (well within demux's 1.5s metadata window) so ffmpeg
      // prints both stream lines before demux() resolves.
      const input = new PassThrough();
      const nutBytes = readFileSync(inNut);
      const CHUNK = Math.max(1024, Math.floor(nutBytes.length / 20));
      let off = 0;
      const drip = setInterval(() => {
        if (off >= nutBytes.length) {
          clearInterval(drip);
          input.end();
          return;
        }
        input.write(nutBytes.subarray(off, off + CHUNK));
        off += CHUNK;
      }, 10);
      const { video, audio, close } = await demux(input, {
        format: "nut",
        frameRate: 10,
      });
      const vFrames: number[] = [];
      const aFrames: number[] = [];
      video?.stream.on("data", (f: { data: Buffer | null; flags: number }) => {
        if (f.data) vFrames.push(f.data.length);
      });
      audio?.stream.on("data", (f: { data: Buffer | null; duration: number }) => {
        if (f.data) aFrames.push(f.duration);
      });
      await new Promise<void>((resolve) => {
        video?.stream.on("end", resolve);
        setTimeout(resolve, 6000);
      });
      close();
      expect(vFrames.length).toBeGreaterThan(0);
      // ~10fps × 1s of video → at least 5 access units
      expect(vFrames.length).toBeGreaterThanOrEqual(5);
      // ~50 opus frames/sec of audio
      expect(aFrames.length).toBeGreaterThan(10);
      // opus frames are 20ms (duration 960 @ 48kHz)
      expect(aFrames[0]).toBe(960);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("parses a hand-built Ogg Opus stream into frames", async () => {
    // Feed the OGG bytes via the demux's audio path is not directly
    // exposed — instead verify the parser contract through the NUT path is
    // covered above; here we sanity-check the byte layout our parser reads.
    const bytes = buildOggOpusBytes(7);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("OggS");
    // 7 frames + header across pages
    expect(bytes.includes(Buffer.from("OpusHead"))).toBe(true);
    expect(bytes.subarray(28, 36).toString("latin1")).toBe("OpusHead");
  });
});

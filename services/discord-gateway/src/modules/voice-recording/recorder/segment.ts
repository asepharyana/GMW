import fs from "node:fs";
import path from "node:path";
import * as prism from "prism-media";
import type { SegmentState } from "../../message-capture/types.js";

export function buildSegmentPaths(
  userDir: string,
  startTime: number,
): { filename: string; jsonFilename: string } {
  return {
    filename: path.join(userDir, `${startTime}.ogg`),
    jsonFilename: path.join(userDir, `${startTime}.json`),
  };
}

export function shouldRotateSegment(
  startTime: number,
  now: number,
  recordingSegmentMs: number,
): boolean {
  return recordingSegmentMs > 0 && now - startTime >= recordingSegmentMs;
}

export class SegmentManager {
  private currentSegment: SegmentState | null = null;
  private segmentIndex = 0;

  constructor(
    private readonly userDir: string,
    private readonly recordingSegmentMs: number,
  ) {}

  open(oggPacketStream: NodeJS.ReadableStream): SegmentState {
    const index = this.segmentIndex++;
    const startTime = Date.now();
    const { filename, jsonFilename } = buildSegmentPaths(
      this.userDir,
      startTime,
    );
    const oggStream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({ channelCount: 2, sampleRate: 48000 }),
      pageSizeControl: { maxPackets: 10 },
      crc: true,
    });
    const out = fs.createWriteStream(filename);
    oggPacketStream.pipe(oggStream).pipe(out);

    this.currentSegment = {
      index,
      startTime,
      endTime: null,
      filename,
      jsonFilename,
      oggStream,
      out,
    };
    return this.currentSegment;
  }

  close(oggPacketStream: NodeJS.ReadableStream): SegmentState | null {
    if (!this.currentSegment) return null;
    const segment = this.currentSegment;
    segment.endTime = Date.now();
    oggPacketStream.unpipe(segment.oggStream);
    segment.oggStream.end();
    this.currentSegment = null;
    return segment;
  }

  rotateIfNeeded(oggPacketStream: NodeJS.ReadableStream): SegmentState | null {
    if (!this.currentSegment) return null;
    if (
      !shouldRotateSegment(
        this.currentSegment.startTime,
        Date.now(),
        this.recordingSegmentMs,
      )
    )
      return null;
    this.close(oggPacketStream);
    return this.open(oggPacketStream);
  }

  getCurrent(): SegmentState | null {
    return this.currentSegment;
  }
}

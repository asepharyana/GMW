import { Transform, TransformCallback } from "node:stream";

/**
 * Transform stream to filter out audio packets that are too small.
 * Packets that are too small are likely to fail decryption by Discord.
 */
export class PacketFilter extends Transform {
  private minPacketSize: number;
  private filteredCount: number = 0;
  private totalCount: number = 0;

  constructor(minPacketSize: number = 10) {
    super();
    this.minPacketSize = minPacketSize;
  }

  _transform(
    chunk: Buffer,
    encoding: string,
    callback: TransformCallback,
  ): void {
    this.totalCount++;

    // Filter out undersized packets
    if (chunk.length >= this.minPacketSize) {
      this.push(chunk);
    } else {
      this.filteredCount++;
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    callback();
  }
}

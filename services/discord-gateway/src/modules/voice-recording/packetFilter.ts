import { Transform, type TransformCallback } from "node:stream";
import { createChildLogger } from "@bete/shared/logger";

const _logger = createChildLogger("packet-filter");

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
    _encoding: string,
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

  /** Returns the number of packets filtered out and processed. */
  getStats(): { filtered: number; total: number } {
    return { filtered: this.filteredCount, total: this.totalCount };
  }

  _flush(callback: TransformCallback): void {
    callback();
  }
}

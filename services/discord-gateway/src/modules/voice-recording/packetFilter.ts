import { Transform, TransformCallback } from "node:stream";

/**
 * Transform stream untuk memfilter audio packets yang terlalu kecil
 * Packet yang terlalu kecil kemungkinan gagal didekripsi oleh Discord
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

    // Filter packet yang terlalu kecil
    if (chunk.length >= this.minPacketSize) {
      this.push(chunk);
    } else {
      this.filteredCount++;
      if (this.filteredCount % 10 === 0) {
        // console.log(`[packet-filter] Filtered ${this.filteredCount} small packets (size < ${this.minPacketSize} bytes)`);
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    // console.log(`[packet-filter] Total packets: ${this.totalCount}, filtered: ${this.filteredCount}, passed: ${this.totalCount - this.filteredCount}`);
    callback();
  }
}

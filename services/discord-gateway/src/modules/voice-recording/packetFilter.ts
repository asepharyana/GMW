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
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    callback();
  }
}

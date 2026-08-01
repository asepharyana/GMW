import fs from "node:fs";

/**
 * Ogg page CRC-32 (RFC 3533): polynomial 0x04c11db7, init 0, MSB-first
 * (no reflection), no final XOR. Table-driven, pure JS — no native deps.
 *
 * prism-media's OggLogicalBitstream writes pages with `crc: false` (node-crc
 * was dropped from the dependency tree), which produces files whose page
 * checksums are all zero. Strict players (ffmpeg, iOS) reject those with
 * "CRC mismatch! / End of file". This re-computes the checksum of every page
 * in place, yielding a spec-compliant Ogg file that any player can open.
 */
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i << 24;
  for (let k = 0; k < 8; k++) {
    c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
  }
  CRC_TABLE[i] = c | 0;
}

function oggCrc32(buffer: Buffer): number {
  let c = 0;
  for (let i = 0; i < buffer.length; i++) {
    c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ buffer[i]) & 0xff]) | 0;
  }
  return c >>> 0;
}

/**
 * Rewrites the CRC field (bytes 22-25) of every OggS page in `filePath`.
 * Returns the number of pages fixed (0 if the file is not a valid Ogg stream).
 */
export function fixOggCrc(filePath: string): number {
  const data = fs.readFileSync(filePath);
  let pos = 0;
  let fixed = 0;

  while (pos + 27 <= data.length) {
    if (data.toString("latin1", pos, pos + 4) !== "OggS") break;
    const nsegs = data[pos + 26];
    let bodyLen = 0;
    for (let i = 0; i < nsegs; i++) bodyLen += data[pos + 27 + i];
    const pageEnd = pos + 27 + nsegs + bodyLen;
    if (pageEnd > data.length) break;

    // Zero the checksum field, then CRC the whole page (RFC 3533).
    data.writeUInt32LE(0, pos + 22);
    data.writeUInt32LE(oggCrc32(data.subarray(pos, pageEnd)), pos + 22);
    fixed++;
    pos = pageEnd;
  }

  if (fixed > 0) fs.writeFileSync(filePath, data);
  return fixed;
}

// Mock CRC for discord.js compatibility
export {};

declare global {
  var crc32: ((data: Buffer) => number) | undefined;
}

if (!globalThis.crc32) {
  globalThis.crc32 = (data: Buffer) => {
    let crc = 0 ^ -1;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ ((crc ^ data[i]) & 0xff);
    }
    return (crc ^ -1) >>> 0;
  };
}

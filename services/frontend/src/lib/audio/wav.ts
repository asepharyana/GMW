/**
 * Client-side audio export helpers (no server/ffmpeg needed).
 *
 * Fetches a remote MP3/OGG, decodes it with the browser's codec stack
 * (Web Audio API), and re-encodes as 16-bit PCM WAV — the format Audacity
 * opens cleanest for editing. Also supports concatenating several decoded
 * clips into a single WAV (e.g. every recording from one filtered user).
 */

/** Get a shared AudioContext (created lazily; kept suspended for decode). */
function getCtx(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API is not available in this browser");
  return new Ctor();
}

/** Fetch a remote audio URL and decode it to an AudioBuffer. */
export async function decodeAudio(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const ctx = getCtx();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    // free the context resources; decodeAudioData is standalone
    void ctx.close().catch(() => {});
  }
}

/**
 * Encode an AudioBuffer to a 16-bit PCM WAV Blob (RIFF).
 * Multi-channel buffers are preserved (interleaved). Audacity imports this
 * as one track per channel.
 */
export function audioBufferToWav(buf: AudioBuffer): Blob {
  const numChannels = Math.max(1, buf.numberOfChannels);
  const sampleRate = buf.sampleRate;
  const frames = buf.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channel data into the sample block. Clamp to [-1, 1].
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buf.getChannelData(ch);
      const s = Math.max(-1, Math.min(1, data[frame]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Concatenate several decoded clips into one mono AudioBuffer (channel 0).
 * Uses the highest sample rate among inputs. Returns null if `buffers` is empty.
 */
export function concatAudioBuffers(buffers: AudioBuffer[]): AudioBuffer | null {
  if (buffers.length === 0) return null;
  const rate = Math.max(...buffers.map((b) => b.sampleRate));
  const totalFrames = buffers.reduce((acc, b) => acc + b.length, 0);
  const ctx = getCtx();
  const out = ctx.createBuffer(1, totalFrames, rate);
  const target = out.getChannelData(0);

  let write = 0;
  for (const b of buffers) {
    const src = b.getChannelData(0);
    // Resample if the source rate differs from the target rate.
    if (b.sampleRate === rate) {
      target.set(src, write);
      write += src.length;
    } else {
      const step = b.sampleRate / rate;
      for (let i = 0; i < src.length; i++) {
        target[Math.floor(write + i * step)] = src[i];
      }
      write += Math.floor(src.length / step);
    }
  }
  return out;
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoke on next tick so the download has a chance to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

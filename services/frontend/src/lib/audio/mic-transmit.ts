/**
 * Browser mic → Discord voice transmit.
 *
 * Pipeline: getUserMedia → AudioContext (48kHz) → AudioWorklet (downsample to
 * 24kHz mono s16le, apply volume, chunk 20ms) → binary WS frames.
 *
 * The backend expects each binary frame to start with a 4-byte magic "PCM\0"
 * followed by raw Int16LE PCM; it base64s the payload and publishes to Redis,
 * where the gateway's VoiceTransmitter feeds it into FFmpeg (24kHz mono s16le
 * → OggOpus) and plays it in the voice channel.
 */

const PCM_MAGIC = new Uint8Array([0x50, 0x43, 0x4d, 0x00]); // "PCM\0"
const TARGET_RATE = 24000;
const CHUNK_MS = 20;

// Inline AudioWorklet processor (Blob URL — works with Next static export,
// no asset pipeline needed).
const WORKLET_SRC = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.targetRate = opts.targetRate || 24000;
    this.ratio = sampleRate / this.targetRate;
    this.chunkSamples = Math.floor((this.targetRate * (opts.chunkMs || 20)) / 1000);
    this.phase = 0;
    this.buffer = new Int16Array(this.chunkSamples);
    this.bufferLen = 0;
    this.volume = typeof opts.volume === 'number' ? opts.volume : 1;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'volume') this.volume = e.data.value;
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    // Mixdown: average available channels
    const chans = input.filter((c) => c && c.length > 0);
    if (chans.length === 0) return true;
    const len = chans[0].length;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < chans.length; c++) s += chans[c][i];
      s /= chans.length;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const v = Math.max(-1, Math.min(1, s * this.volume));
        this.buffer[this.bufferLen++] = (v * 32767) | 0;
        if (this.bufferLen >= this.chunkSamples) {
          const out = new Int16Array(this.buffer);
          this.port.postMessage(out.buffer, [out.buffer]);
          this.buffer = new Int16Array(this.chunkSamples);
          this.bufferLen = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-downsampler', PcmDownsampler);
`;

export class MicTransmitter {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private active = false;
  private volume = 1;

  constructor(private readonly onChunk: (frame: ArrayBuffer) => void) {}

  get isActive(): boolean {
    return this.active;
  }

  async start(volume = 1): Promise<void> {
    if (this.active) return;
    this.volume = volume;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is not available (insecure context?)");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.ctx = new AudioContext({ sampleRate: 48000 });

    const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    try {
      await this.ctx.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-downsampler", {
      processorOptions: {
        targetRate: TARGET_RATE,
        chunkMs: CHUNK_MS,
        volume: this.volume,
      },
    });

    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (!this.active || !(e.data instanceof ArrayBuffer)) return;
      const frame = new Uint8Array(PCM_MAGIC.length + e.data.byteLength);
      frame.set(PCM_MAGIC, 0);
      frame.set(new Uint8Array(e.data), PCM_MAGIC.length);
      this.onChunk(frame.buffer);
    };

    source.connect(this.node);
    // Keep the graph alive with an inaudible tail (silent gain) so the
    // worklet keeps pulling mic data without audible feedback.
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.node.connect(silent);
    silent.connect(this.ctx.destination);

    this.active = true;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.node?.port.postMessage({ type: "volume", value: volume });
  }

  stop(): void {
    this.active = false;
    this.node?.port.postMessage({ type: "volume", value: 0 });
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

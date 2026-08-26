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

/** Mic access error with user-actionable detail. */
export class MicAccessError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "not-supported"
      | "permission-denied"
      | "no-mic"
      | "timeout"
      | "unknown",
  ) {
    super(message);
    this.name = "MicAccessError";
  }
}

export interface MicTransmitterOptions {
  /** Enable browser-level noise suppression (default: true). */
  noiseSuppression?: boolean;
  /** Enable echo cancellation (default: true). */
  echoCancellation?: boolean;
  /** Enable auto gain control (default: true). */
  autoGainControl?: boolean;
}

export class MicTransmitter {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private active = false;
  private volume = 1;
  private noiseSuppression = true;

  constructor(
    private readonly onChunk: (frame: ArrayBuffer) => void,
    private readonly options: MicTransmitterOptions = {},
  ) {
    this.noiseSuppression = options.noiseSuppression ?? true;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isNoiseSuppressionEnabled(): boolean {
    return this.noiseSuppression;
  }

  async start(volume = 1): Promise<void> {
    if (this.active) return;
    this.volume = volume;

    // ── Check getUserMedia support ───────────────────────────────────────
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicAccessError(
        "getUserMedia is not available — are you on HTTPS or localhost?",
        "not-supported",
      );
    }

    // ── Request mic with noise suppression constraints ───────────────────
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.options.echoCancellation ?? true,
          noiseSuppression: this.noiseSuppression,
          autoGainControl: this.options.autoGainControl ?? true,
        },
      });
    } catch (err) {
      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          throw new MicAccessError(
            "Microphone access denied — allow mic permission in your browser",
            "permission-denied",
          );
        }
        if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          throw new MicAccessError(
            "No microphone found — connect a mic and try again",
            "no-mic",
          );
        }
        if (err.name === "OverconstrainedError") {
          throw new MicAccessError(
            "Microphone does not support the requested constraints",
            "unknown",
          );
        }
        if (err.name === "AbortError" || err.name === "TimeoutError") {
          throw new MicAccessError(
            "Microphone access timed out — try again",
            "timeout",
          );
        }
      }
      throw new MicAccessError(
        `Failed to access microphone: ${err instanceof Error ? err.message : String(err)}`,
        "unknown",
      );
    }

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

    // Level metering tap: analyser reads the raw mic (pre-volume) so the UI
    // shows what the mic actually hears. Silent sink keeps the graph alive.
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);

    // Keep the graph alive with an inaudible tail (silent gain) so the
    // worklet keeps pulling mic data without audible feedback.
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.node.connect(silent);
    silent.connect(this.ctx.destination);

    this.active = true;
  }

  /** RMS mic level 0..1 since the last call (drives the live meter UI). */
  getLevel(): number {
    if (!this.analyser || !this.levelBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] ** 2;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.node?.port.postMessage({ type: "volume", value: volume });
  }

  /** Toggle noise suppression. Requires restart to take effect. */
  setNoiseSuppression(enabled: boolean): void {
    this.noiseSuppression = enabled;
  }

  stop(): void {
    this.active = false;
    this.node?.port.postMessage({ type: "volume", value: 0 });
    this.node?.disconnect();
    this.node = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.levelBuf = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

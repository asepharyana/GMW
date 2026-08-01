/**
 * Receive Discord voice PCM over the WebSocket and play it through the
 * browser audio stack.
 *
 * Binary frame format (from the gateway, via backend WS):
 *   Byte 0–3:  FNV-1a 32-bit userId hash (UInt32LE)
 *   Byte 4+:   PCM audio (24kHz mono Int16LE)
 *
 * The player keeps one ring buffer per user (2s @ 24kHz), upsamples
 * 24k → 48k with linear interpolation inside the audio callback, and mixes
 * every active user into a single mono output. A ScriptProcessorNode is used
 * because it runs on the main thread — ring buffers need no SharedArrayBuffer
 * and work without COOP/COEP headers. `start()` must be called from a user
 * gesture (audio autoplay policy).
 */

const INPUT_RATE = 24000;
const OUTPUT_RATE = 48000;
const RING_SECONDS = 2;
const RING_LEN = INPUT_RATE * RING_SECONDS;

interface UserRing {
  data: Float32Array;
  /** absolute write position (monotonic) */
  write: number;
  /** absolute read position as float — advances at 0.5× per output sample */
  readPos: number;
  /** last tick where this user produced audio (for stale-ring cleanup) */
  lastActive: number;
}

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private master: GainNode | null = null;
  private rings = new Map<number, UserRing>();
  private levels = new Map<number, number>();
  private volume = 0.75;
  private started = false;

  get isStarted(): boolean {
    return this.started;
  }

  /** Create the AudioContext + processor. MUST be called from a user gesture. */
  start(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor({ sampleRate: OUTPUT_RATE });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.processor = this.ctx.createScriptProcessor(4096, 0, 1);
    this.processor.onaudioprocess = (e) => this.tick(e);
    this.processor.connect(this.master);
    this.started = true;
  }

  /** Push one PCM chunk (s16 mono @24kHz) for a user. */
  push(userIdHash: number, samples: Int16Array): void {
    if (!this.started || samples.length === 0) return;
    let ring = this.rings.get(userIdHash);
    if (!ring) {
      ring = {
        data: new Float32Array(RING_LEN),
        write: 0,
        readPos: 0,
        lastActive: Date.now(),
      };
      this.rings.set(userIdHash, ring);
    }
    ring.lastActive = Date.now();
    for (let i = 0; i < samples.length; i++) {
      ring.data[ring.write % RING_LEN] = samples[i] / 32768;
      ring.write++;
    }
    // Overflow guard: never let the ring lag more than RING_LEN behind.
    const lag = ring.write - ring.readPos;
    if (lag > RING_LEN - 4096) {
      ring.readPos = ring.write - RING_LEN + 4096;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Peak |sample| per user since the last call (drives the UI waveform). */
  getLevels(): Map<number, number> {
    return new Map(this.levels);
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
    }
    this.processor = null;
    this.ctx = null;
    this.master = null;
    this.rings.clear();
    this.levels.clear();
    this.started = false;
  }

  private tick(e: AudioProcessingEvent): void {
    const out = e.outputBuffer.getChannelData(0);
    out.fill(0);
    const n = out.length;
    const step = INPUT_RATE / OUTPUT_RATE; // 0.5
    const nextLevels = new Map<number, number>();

    for (const [hash, ring] of this.rings) {
      let level = 0;
      for (let i = 0; i < n; i++) {
        const pos = ring.readPos + i * step;
        if (pos + 1 >= ring.write) break;
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        const a = ring.data[i0 % RING_LEN];
        const b = ring.data[(i0 + 1) % RING_LEN];
        const v = a + (b - a) * frac;
        out[i] += v;
        const av = Math.abs(v);
        if (av > level) level = av;
      }
      ring.readPos += n * step;
      if (ring.readPos > ring.write) ring.readPos = ring.write;
      if (level > 0.001) {
        ring.lastActive = Date.now();
        nextLevels.set(hash, level);
      }
    }

    // Drop users silent for >5s so the ring map doesn't grow unbounded.
    const now = Date.now();
    for (const [hash, ring] of this.rings) {
      if (now - ring.lastActive > 5000) this.rings.delete(hash);
    }

    this.levels = nextLevels;
  }
}

// ─── Audio playback hook — receives PCM from WebSocket and plays through Web Audio API ──
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("use-audio-playback");

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const LEVEL_COUNT = 32;

// Pre-computed level distribution shape — computed once at module load, not per render
const LEVEL_SHAPE = Array.from(
  { length: LEVEL_COUNT },
  (_, i) => 0.3 + (Math.sin(i * 0.6) * 0.35 + 0.65) * 0.7,
);

/** Reverse lookup: userIdHash → userId, populated by handleIncomingBinary */
const userIdHashToId = new Map<number, string>();

export function useAudioPlayback() {
  const [isListening, setIsListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(
    Array.from({ length: LEVEL_COUNT }, () => 0.04),
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const userTimelinesRef = useRef(new Map<string, number>());

  // Cleanup AudioContext on unmount to prevent leak
  useEffect(() => {
    return () => {
      const ctx = audioContextRef.current;
      if (ctx) {
        ctx.close();
        audioContextRef.current = null;
      }
      userTimelinesRef.current.clear();
    };
  }, []);

  // Prune stale timeline entries (> 30s old) based on current audioContext time
  const pruneTimelines = useCallback(() => {
    const now = audioContextRef.current?.currentTime ?? performance.now() / 1000;
    for (const [userId, endTime] of userTimelinesRef.current) {
      if (endTime + 30 < now) userTimelinesRef.current.delete(userId);
    }
  }, []);

  /**
   * Handle incoming binary PCM from WS.
   * Format per chunk: 4-byte userId hash (UInt32LE) + raw PCM (Int16).
   * userId hash → userId mapping is populated by voice_active_user events.
   */
  const handleIncomingBinary = useCallback(
    (buffer: ArrayBuffer) => {
      const view = new DataView(buffer);
      if (buffer.byteLength < 5) return; // Need at least 4-byte hash + 1 PCM byte
      const userIdHash = view.getUint32(0, true);
      const userId = userIdHashToId.get(userIdHash) ?? `user:${userIdHash}`;
      const pcmBytes = buffer.byteLength - 4;
      if (pcmBytes === 0) return;

      const int16Array = new Int16Array(
        buffer,
        4,
        pcmBytes / 2,
      );
      if (int16Array.length === 0) return;

      // RMS + level computation (same as before)
      let sumSquares = 0;
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        const normalized = int16Array[i] / 32768;
        float32Array[i] = normalized;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / int16Array.length);
      const dbLevel = Math.min(1, Math.max(0.04, rms * 8));

      setLevels((prev) =>
        prev.map((_, index) =>
          Math.max(0.04, dbLevel * LEVEL_SHAPE[index] * 5),
        ),
      );

      const audioContext = audioContextRef.current;
      if (!isListening || !audioContext) return;

      const audioBuffer = audioContext.createBuffer(
        CHANNELS,
        float32Array.length,
        SAMPLE_RATE,
      );
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const currentTime = audioContext.currentTime;
      let nextStart = userTimelinesRef.current.get(userId) || 0;
      if (nextStart < currentTime) nextStart = currentTime + 0.05;
      source.start(nextStart);
      userTimelinesRef.current.set(
        userId,
        nextStart + audioBuffer.duration,
      );
      pruneTimelines();
    },
    [isListening, pruneTimelines],
  );

  /**
   * Register a userId → hash mapping from voice_active_user events.
   */
  const registerUserId = useCallback((userId: string) => {
    const hash = fnv1a32(userId);
    userIdHashToId.set(hash, userId);
  }, []);

  // Legacy JSON handler kept for backward compat
  const handleIncomingPcm = useCallback(
    (data: { userId: string; pcm: string }) => {
      // Decode base64 PCM data
      try {
        const bytes = Uint8Array.from(atob(data.pcm), (c) => c.charCodeAt(0));
        if (bytes.length === 0) return;
        const int16Array = new Int16Array(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength / 2,
        );

        // 5b/5d: Real RMS calculation + Float32Array conversion in single pass
        let sumSquares = 0;
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          const normalized = int16Array[i] / 32768;
          float32Array[i] = normalized;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / int16Array.length);
        // Scale RMS to a lively visualization range, clamp to [0.04, 1.0]
        const dbLevel = Math.min(1, Math.max(0.04, rms * 8));

        // 5c: Use pre-computed LEVEL_SHAPE (no Date.now() per PCM frame)
        setLevels((prev) =>
          prev.map((_, index) =>
            Math.max(0.04, dbLevel * LEVEL_SHAPE[index] * 5),
          ),
        );

        const audioContext = audioContextRef.current;
        if (!isListening || !audioContext) return;

        const audioBuffer = audioContext.createBuffer(
          CHANNELS,
          float32Array.length,
          SAMPLE_RATE,
        );
        audioBuffer.getChannelData(0).set(float32Array);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        // Schedule playback per user to avoid overlaps
        const currentTime = audioContext.currentTime;
        let nextStart = userTimelinesRef.current.get(data.userId) || 0;
        if (nextStart < currentTime) nextStart = currentTime + 0.05;
        source.start(nextStart);
        userTimelinesRef.current.set(
          data.userId,
          nextStart + audioBuffer.duration,
        );
        pruneTimelines();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Failed to decode PCM audio", {
          userId: data.userId,
          error: message,
        });
      }
    },
    [isListening, pruneTimelines],
  );

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await audioContextRef.current?.suspend();
      userTimelinesRef.current.clear();
      setIsListening(false);
      logger.info("Audio playback paused");
      return;
    }
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioContextRef.current ??= new AudioContextCtor({
      sampleRate: SAMPLE_RATE,
    });
    await audioContextRef.current.resume();
    setIsListening(true);
    logger.info("Audio playback started");
  }, [isListening]);

  return {
    isListening,
    levels,
    handleIncomingPcm,
    handleIncomingBinary,
    registerUserId,
    toggleListening,
    audioContextRef,
  };
}

/** 32-bit FNV-1a hash for userId → consistent 4-byte identifier */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}


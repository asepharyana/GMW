// ─── Audio playback hook — receives PCM from WebSocket and plays through Web Audio API ──
import { useCallback, useRef, useState } from "react";

const SAMPLE_RATE = 24000;
const CHANNELS = 1;

export function useAudioPlayback() {
  const [isListening, setIsListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(
    Array.from({ length: 32 }, () => 0.04),
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const userTimelinesRef = useRef(new Map<string, number>());

  const handleIncomingPcm = useCallback(
    (data: { userId: string; pcm: string }) => {
      // Decode base64 PCM data
      const binaryString = atob(data.pcm);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);

      // Calculate audio levels for visualization
      let sum = 0;
      for (const sample of int16Array) sum += Math.abs(sample / 32768);
      const average = int16Array.length ? sum / int16Array.length : 0;
      setLevels((prev) =>
        prev.map((_, index) =>
          Math.max(
            0.04,
            average *
              (0.5 + Math.sin(index * 0.6 + Date.now() / 140) * 0.35 + 0.65) *
              5,
          ),
        ),
      );

      const audioContext = audioContextRef.current;
      if (!isListening || !audioContext) return;

      // Convert to float32 for Web Audio API
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++)
        float32Array[i] = int16Array[i] / 32768;

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
    },
    [isListening],
  );

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await audioContextRef.current?.suspend();
      userTimelinesRef.current.clear();
      setIsListening(false);
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
  }, [isListening]);

  return {
    isListening,
    levels,
    handleIncomingPcm,
    toggleListening,
    audioContextRef,
  };
}

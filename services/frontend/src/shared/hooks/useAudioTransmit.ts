// ─── Audio transmit hook — captures mic, encodes to PCM, sends via WebSocket ──
import { useCallback, useRef, useState } from "react";
import { getAPIURL } from "../api/client.js";
import { createLogger } from "../lib/logger";

const SAMPLE_RATE = 24000;
const LEVEL_THROTTLE_MS = 50; // 20Hz mic level updates
const logger = createLogger("useAudioTransmit");

async function sendTransmitCommand(command: string): Promise<void> {
  // Send via HTTP API (kept as exported function for backward compatibility)
  const resp = await fetch(`${getAPIURL()}/api/voice/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (!resp.ok) {
    logger.warn("HTTP command response", {
      status: resp.status,
      statusText: resp.statusText,
    });
    const text = await resp.text().catch(() => resp.statusText);
    logger.warn("HTTP command failed", { error: text });
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }
}

function sendWsCommand(
  socketRef: { readonly current: WebSocket | null },
  command: string,
): boolean {
  if (socketRef.current?.readyState === WebSocket.OPEN) {
    socketRef.current.send(
      JSON.stringify({
        type: "voice_command",
        command,
      }),
    );
    return true;
  }
  return false;
}

export function useAudioTransmit(socketRef: {
  readonly current: WebSocket | null;
}): {
  isStreaming: boolean;
  micError: string | null;
  micLevel: number;
  toggle: () => Promise<void>;
  stopTransmit: () => void;
  startTransmit: () => Promise<void>;
  stop: () => void;
  start: () => Promise<void>;
} {
  const [isStreaming, setIsStreaming] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isTransmittingRef = useRef(false);
  const lastLevelUpdateRef = useRef(0);

  const stop = useCallback(() => {
    // 6c: Prefer WebSocket round-trip over HTTP for lower latency
    if (!sendWsCommand(socketRef, "voice:transmit:stop")) {
      sendTransmitCommand("voice:transmit:stop").catch(() => {});
    }

    setMicError(null);
    setIsStreaming(false);
    isTransmittingRef.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setMicLevel(0);
  }, [socketRef]);

  const start = useCallback(async () => {
    // Reset mic error on new attempt
    setMicError(null);

    // 6c: Prefer WebSocket round-trip over HTTP for lower latency
    if (!sendWsCommand(socketRef, "voice:transmit:start")) {
      await sendTransmitCommand("voice:transmit:start");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setMicError(
          "Microphone access denied. Please allow microphone permissions.",
        );
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setMicError(`Microphone access failed: ${message}`);
      }
      logger.error("getUserMedia failed", { error: String(err) });
      return;
    }
    streamRef.current = stream;
    setIsStreaming(true);
    isTransmittingRef.current = true;
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;
    const processor = audioContext.createScriptProcessor(1024, 1, 1);
    processorRef.current = processor;
    source.connect(processor);
    processor.connect(audioContext.destination);
    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);

      // Compute RMS from input buffer for mic level metering
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSquares += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSquares / inputData.length);
      const now = Date.now();
      if (now - lastLevelUpdateRef.current >= LEVEL_THROTTLE_MS) {
        lastLevelUpdateRef.current = now;
        // Scale so conversational speech hits ~0.3-0.6
        setMicLevel(Math.min(1, rms * 3));
      }

      if (!isTransmittingRef.current) return;
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return;

      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++)
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;

      // Send as binary: 4-byte magic "PCM\0" + raw PCM Int16
      const magic = new Uint8Array([0x50, 0x43, 0x4d, 0x00]); // "PCM\0"
      const pcmBytes = new Uint8Array(pcmData.buffer);
      const buf = new Uint8Array(magic.length + pcmBytes.length);
      buf.set(magic, 0);
      buf.set(pcmBytes, magic.length);
      socketRef.current.send(buf.buffer);
    };
  }, [socketRef]);

  const stopTransmit = useCallback(() => {
    if (!isTransmittingRef.current) return;
    isTransmittingRef.current = false;
    if (!sendWsCommand(socketRef, "voice:transmit:stop")) {
      sendTransmitCommand("voice:transmit:stop").catch(() => {});
    }
    setIsStreaming(false);
  }, [socketRef]);

  const startTransmit = useCallback(async () => {
    if (isTransmittingRef.current) return;
    isTransmittingRef.current = true;
    if (!sendWsCommand(socketRef, "voice:transmit:start")) {
      await sendTransmitCommand("voice:transmit:start");
    }
    setIsStreaming(true);
  }, [socketRef]);

  const toggle = useCallback(async () => {
    if (isStreaming) {
      stopTransmit();
    } else if (streamRef.current) {
      // Mic already captured, resume transmission without re-acquiring
      await startTransmit();
    } else {
      await start();
    }
  }, [isStreaming, startTransmit, stopTransmit, start]);

  return {
    isStreaming,
    micError,
    micLevel,
    toggle,
    stopTransmit,
    startTransmit,
    stop,
    start,
  };
}

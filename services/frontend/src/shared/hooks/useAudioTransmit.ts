// ─── Audio transmit hook — captures mic, encodes to PCM, sends via WebSocket ──
import { useCallback, useRef, useState } from "react";
import { getAPIURL } from "../api/client.js";
import { createLogger } from "../lib/logger";

const SAMPLE_RATE = 24000;
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
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stop = useCallback(() => {
    // 6c: Prefer WebSocket round-trip over HTTP for lower latency
    if (!sendWsCommand(socketRef, "voice:transmit:stop")) {
      sendTransmitCommand("voice:transmit:stop").catch(() => {});
    }

    setIsStreaming(false);
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, [socketRef]);

  const start = useCallback(async () => {
    // 6c: Prefer WebSocket round-trip over HTTP for lower latency
    if (!sendWsCommand(socketRef, "voice:transmit:start")) {
      await sendTransmitCommand("voice:transmit:start");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setIsStreaming(true);
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioContext = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(1024, 1, 1);
    processorRef.current = processor;
    source.connect(processor);
    processor.connect(audioContext.destination);
    processor.onaudioprocess = (event) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return;
      const inputData = event.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++)
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;

      // 6b: Safe loop instead of spread operator to avoid call-stack overflow
      const bytes = new Uint8Array(pcmData.buffer);
      let str = '';
      for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(str);

      socketRef.current.send(
        JSON.stringify({
          type: "voice_transmit",
          buffer: base64,
        }),
      );
    };
  }, [socketRef]);

  const toggle = useCallback(async () => {
    if (isStreaming) stop();
    else await start();
  }, [isStreaming, start, stop]);

  return { isStreaming, toggle, stop, start };
}

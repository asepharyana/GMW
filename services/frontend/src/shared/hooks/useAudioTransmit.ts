// ─── Audio transmit hook — captures mic, encodes to PCM, sends via WebSocket ──
import { useCallback, useRef, useState } from "react";

const SAMPLE_RATE = 24000;

export function useAudioTransmit(socketRef: {
  readonly current: WebSocket | null;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stop = useCallback(() => {
    // Send voice:transmit:stop command to backend
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'voice_command',
        command: 'voice:transmit:stop'
      }));
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
    // Send voice:transmit:start command to backend
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'voice_command',
        command: 'voice:transmit:start'
      }));
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
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
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

      // Convert to base64
      const bytes = new Uint8Array(pcmData.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Send as JSON for backend to forward to Redis
      socketRef.current.send(JSON.stringify({
        type: 'voice_transmit',
        buffer: base64
      }));
    };
  }, [socketRef]);

  const toggle = useCallback(async () => {
    if (isStreaming) stop();
    else await start();
  }, [isStreaming, start, stop]);

  return { isStreaming, toggle, stop, start };
}

"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { WsConnection } from "./connection";
import type { PcmChunk, WsEventHandler, WsEventType, WsStatus } from "./types";

interface WsContextValue {
  status: WsStatus;
  connect: () => void;
  disconnect: () => void;
  sendText: (text: string) => void;
  sendBinary: (data: ArrayBufferLike) => void;
  /** Subscribe to a typed WS event. Returns unsubscribe function. */
  on: <E extends WsEventType>(
    eventType: E,
    handler: WsEventHandler<E>,
  ) => () => void;
  /** Subscribe to binary PCM events. Returns unsubscribe function. */
  onPcm: (handler: (chunk: PcmChunk) => void) => () => void;
}

const WsContext = createContext<WsContextValue | null>(null);

/** FNV-1a 32-bit hash matching the backend's hashUserId function */
function _hashUserId(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function WsProvider({
  children,
  url,
}: {
  children: ReactNode;
  url?: string;
}) {
  const connRef = useRef<WsConnection | null>(null);
  const [status, setStatus] = useState<WsStatus>("disconnected");

  // Event handler registry — Ref so listeners survive re-renders without reconnect
  // Using unknown as internal store; typed at the subscribe interface
  const handlersRef = useRef<Record<string, Set<(data: unknown) => void>>>({});
  const pcmHandlersRef = useRef<Set<(chunk: PcmChunk) => void>>(new Set());

  const handleJsonEvent = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json);
      const eventType = parsed.type as string;
      const data = parsed.data ?? parsed.state ?? parsed;

      const handlers = handlersRef.current;
      const eventHandlers = handlers[eventType as WsEventType];
      if (eventHandlers && eventHandlers.size > 0) {
        eventHandlers.forEach((h) => h(data));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const handleBinaryEvent = useCallback((buffer: ArrayBuffer) => {
    if (buffer.byteLength < 4 || pcmHandlersRef.current.size === 0) return;

    const view = new DataView(buffer);
    const userIdHash = view.getUint32(0, true);
    const samples = new Int16Array(buffer, 4);

    const chunk: PcmChunk = { userIdHash, samples };
    pcmHandlersRef.current.forEach((h) => h(chunk));
  }, []);

  useEffect(() => {
    const conn = new WsConnection(url);
    connRef.current = conn;

    const unsubStatus = conn.onStatusChange(setStatus);
    const unsubEvent = conn.onEvent((event) => {
      if (event.type === "text") {
        handleJsonEvent(event.data);
      } else {
        handleBinaryEvent(event.data);
      }
    });

    conn.connect();

    return () => {
      conn.destroy();
      connRef.current = null;
      unsubStatus();
      unsubEvent();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, handleBinaryEvent, handleJsonEvent]);

  const subscribe = useCallback(
    <E extends WsEventType>(_eventType: E, handler: WsEventHandler<E>) => {
      const eventType = _eventType as string;
      if (!handlersRef.current[eventType]) {
        handlersRef.current[eventType] = new Set();
      }
      handlersRef.current[eventType].add(handler as (data: unknown) => void);
      return () => {
        handlersRef.current[eventType]?.delete(
          handler as (data: unknown) => void,
        );
      };
    },
    [],
  );

  const subscribePcm = useCallback((handler: (chunk: PcmChunk) => void) => {
    pcmHandlersRef.current.add(handler);
    return () => {
      pcmHandlersRef.current.delete(handler);
    };
  }, []);

  const connect = useCallback(() => connRef.current?.connect(), []);
  const disconnect = useCallback(() => connRef.current?.disconnect(), []);
  const sendText = useCallback(
    (text: string) => connRef.current?.sendText(text),
    [],
  );
  const sendBinary = useCallback(
    (data: ArrayBufferLike) => connRef.current?.sendBinary(data),
    [],
  );

  return (
    <WsContext.Provider
      value={{
        status,
        connect,
        disconnect,
        sendText,
        sendBinary,
        on: subscribe,
        onPcm: subscribePcm,
      }}
    >
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) {
    throw new Error("useWebSocket must be used within a WsProvider");
  }
  return ctx;
}

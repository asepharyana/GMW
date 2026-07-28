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
import { chatbotApi } from "@/lib/api";
import type { ChatHistoryMessage } from "@/lib/types";

export type MascotExpression = "idle" | "listening" | "surprise" | "happy" | "sad" | "talking";

interface MascotMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface MascotContextValue {
  /** Expression the mascot avatar should display */
  expression: MascotExpression;
  setExpression: (expr: MascotExpression) => void;

  /** Whether the enlarged bubble is minimized to a small icon */
  minimized: boolean;
  setMinimized: (v: boolean) => void;

  /** Whether the chat panel inside the bubble is open */
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;

  /**
   * @deprecated Use `minimized` / `setMinimized` instead.
   * Legacy toggle alias kept for compatibility.
   */
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;

  /** Chat messages with real API backend */
  messages: MascotMessage[];
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => Promise<void>;
  isTyping: boolean;
}

const MascotContext = createContext<MascotContextValue | null>(null);

export function MascotProvider({ children }: { children: ReactNode }) {
  const [expression, setExpression] = useState<MascotExpression>("idle");
  const [minimized, setMinimized] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<MascotMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const historyFetched = useRef(false);

  // Derived legacy state
  const isOpen = !minimized;

  const setOpen = useCallback((open: boolean) => {
    setMinimized(!open);
  }, []);

  const toggle = useCallback(() => {
    setMinimized((prev) => !prev);
  }, []);

  // Load chat history on first mount
  useEffect(() => {
    if (historyFetched.current) return;
    historyFetched.current = true;

    chatbotApi.getHistory().then((history) => {
      const mapped = (history ?? []).map((msg: ChatHistoryMessage) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        timestamp: msg.timestamp,
      }));
      setMessages(mapped);
    }).catch(() => {
      // API may not be available yet — silently ignore
    });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMsg: MascotMessage = {
      role: "user",
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setExpression("listening");
    setIsTyping(true);

    try {
      const res = await chatbotApi.send(content.trim());
      const botMsg: MascotMessage = {
        role: "assistant",
        content: res.response,
        timestamp: res.timestamp ?? new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setExpression("happy");
    } catch {
      const errorMsg: MascotMessage = {
        role: "assistant",
        content: "Sorry, I couldn't process that request. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setExpression("sad");
    } finally {
      setIsTyping(false);
    }
  }, []);

  const clearMessages = useCallback(async () => {
    try {
      await chatbotApi.clearHistory();
    } catch {
      // Best-effort clear
    }
    setMessages([]);
  }, []);

  return (
    <MascotContext.Provider
      value={{
        expression,
        setExpression,
        minimized,
        setMinimized,
        chatOpen,
        setChatOpen,
        isOpen,
        setOpen,
        toggle,
        messages,
        sendMessage,
        clearMessages,
        isTyping,
      }}
    >
      {children}
    </MascotContext.Provider>
  );
}

export function useMascot(): MascotContextValue {
  const ctx = useContext(MascotContext);
  if (!ctx) {
    throw new Error("useMascot must be used within a MascotProvider");
  }
  return ctx;
}

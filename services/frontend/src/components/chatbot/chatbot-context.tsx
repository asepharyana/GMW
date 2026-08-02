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
import { useChatbotUserId } from "@/hooks/use-chatbot-user";
import { chatbotApi } from "@/lib/api";

export type ChatbotExpression =
  | "idle"
  | "listening"
  | "surprise"
  | "happy"
  | "sad"
  | "talking";

interface ChatbotMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatbotContextValue {
  /** Expression the chatbot avatar should display */
  expression: ChatbotExpression;
  setExpression: (expr: ChatbotExpression) => void;

  /** Whether the enlarged bubble is minimized to a small icon */
  minimized: boolean;
  setMinimized: (v: boolean) => void;

  /**
   * @deprecated Use `minimized` / `setMinimized` instead.
   * Legacy toggle alias kept for compatibility.
   */
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;

  /** Chat messages with real API backend */
  messages: ChatbotMessage[];
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => Promise<void>;
  isTyping: boolean;

  /** Active guild context sent to the backend so answers reference the server */
  guildId: string;
  setGuildId: (g: string) => void;
}

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [expression, setExpression] = useState<ChatbotExpression>("idle");
  const [minimized, setMinimized] = useState(true);
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [guildId, setGuildId] = useState("");
  const historyFetched = useRef(false);
  const userId = useChatbotUserId();

  // Derived legacy state
  const isOpen = !minimized;

  const setOpen = useCallback((open: boolean) => {
    setMinimized(!open);
  }, []);

  const toggle = useCallback(() => {
    setMinimized((prev) => !prev);
  }, []);

  // Load chat history on first mount (per-device user history)
  useEffect(() => {
    if (historyFetched.current || !userId) return;
    historyFetched.current = true;

    chatbotApi
      .getHistory(userId)
      .then((res) => {
        // Backend returns rows {user_message, bot_response, created_at} —
        // interleave each user message with its bot reply.
        const withReplies: ChatbotMessage[] = [];
        for (const row of res.history ?? []) {
          withReplies.push({
            role: "user",
            content: row.user_message,
            timestamp: row.created_at,
          });
          withReplies.push({
            role: "assistant",
            content: row.bot_response,
            timestamp: row.created_at,
          });
        }
        setMessages(withReplies);
      })
      .catch(() => {
        // API may not be available yet — silently ignore
      });
  }, [userId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      const userMsg: ChatbotMessage = {
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setExpression("listening");
      setIsTyping(true);

      try {
        // Send active guild as context so the backend can answer with
        // real server insights (serverInsights path in chatbot.service),
        // and the per-device user id so the history stays isolated.
        const res = await chatbotApi.send(content.trim(), guildId, userId);
        const botMsg: ChatbotMessage = {
          role: "assistant",
          content: res.response,
          timestamp: res.timestamp ?? new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
        setExpression("happy");
      } catch {
        const errorMsg: ChatbotMessage = {
          role: "assistant",
          content:
            "Maaf, aku lagi gagal nyambung ke server. Coba tanya lagi ya 🙏",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setExpression("sad");
      } finally {
        setIsTyping(false);
      }
    },
    [guildId, userId],
  );

  const clearMessages = useCallback(async () => {
    try {
      await chatbotApi.clearHistory(userId);
    } catch {
      // Best-effort clear
    }
    setMessages([]);
  }, [userId]);

  return (
    <ChatbotContext.Provider
      value={{
        expression,
        setExpression,
        minimized,
        setMinimized,
        isOpen,
        setOpen,
        toggle,
        messages,
        sendMessage,
        clearMessages,
        isTyping,
        guildId,
        setGuildId,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot(): ChatbotContextValue {
  const ctx = useContext(ChatbotContext);
  if (!ctx) {
    throw new Error("useChatbot must be used within a ChatbotProvider");
  }
  return ctx;
}

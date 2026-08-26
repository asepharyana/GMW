"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Bot,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives";
import { useChatbotUserId } from "@/hooks/use-chatbot-user";
import { chatbotApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: number;
}

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const userId = useChatbotUserId();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    chatbotApi
      .getHistory(userId || undefined)
      .then((res) => {
        if (res.history) {
          const loaded: ChatMessage[] = res.history.flatMap((h) => [
            {
              id: `${h.id}-u`,
              sender: "user",
              text: h.user_message,
              timestamp: new Date(h.created_at).getTime(),
            },
            {
              id: `${h.id}-b`,
              sender: "bot",
              text: h.bot_response,
              timestamp: new Date(h.created_at).getTime() + 100,
            },
          ]);
          setMessages(loaded);
        }
      })
      .catch(() => {});
  }, [userId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  // GSAP animation for floating window
  useGSAP(
    () => {
      if (!containerRef.current) return;
      if (open) {
        gsap.fromTo(
          containerRef.current,
          { opacity: 0, scale: 0.95, y: 15 },
          { opacity: 1, scale: 1, y: 0, duration: 0.25, ease: "power2.out" },
        );
      }
    },
    { dependencies: [open], scope: containerRef },
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await chatbotApi.send(query, undefined, userId || "operator");
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: res.response || "No response received.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "bot",
        text: "Signal telemetry fault. Failed to communicate with neural core.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating Tactical Launcher Button */}
      {!open && (
        <button
          type="button"
          aria-label="Open neural HUD assistant"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-5 z-50 flex size-11 items-center justify-center rounded-full border border-signal/40 bg-surface text-signal shadow-[0_0_20px_var(--color-signal-glow)] transition-all duration-200 hover:scale-105 hover:border-signal hover:bg-signal hover:text-white"
        >
          <Sparkles className="size-5 animate-breathe" />
        </button>
      )}

      {/* Neural Assistant Dialog */}
      {open && (
        <div
          ref={containerRef}
          className={`glass fixed right-4 bottom-18 z-50 flex flex-col p-0 shadow-2xl transition-all duration-200 ${
            expanded
              ? "h-[min(85dvh,680px)] w-[min(94vw,540px)]"
              : "h-[min(65dvh,480px)] w-[min(92vw,360px)]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-[4px] bg-signal/15 text-signal">
                <Bot className="size-3.5" />
              </span>
              <div>
                <span className="font-mono text-xs font-bold text-ink">
                  Neural Core Assistant
                </span>
                <span className="ml-2 font-mono text-[10px] text-success">
                  ● ACTIVE
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="rounded-[5px] p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {expanded ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[5px] p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-3.5"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center font-mono text-xs text-ink-muted">
                <Sparkles className="mb-2 size-6 text-signal opacity-60" />
                <span>Neural Assistant ready.</span>
                <span className="text-[10px] text-ink-faint">
                  Ask about telemetry, moderation policies, or channel activity.
                </span>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.sender === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[8px] p-2.5 text-xs leading-relaxed ${
                        isUser
                          ? "bg-signal text-white"
                          : "hud-card text-ink-soft"
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="mt-1 font-mono text-[9px] text-ink-faint">
                      {formatRelativeTime(m.timestamp)}
                    </span>
                  </div>
                );
              })
            )}

            {sending && (
              <div className="flex items-center gap-2 font-mono text-xs text-ink-muted">
                <Loader2 className="size-3.5 animate-spin text-signal" />
                <span>Processing vector inference...</span>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-1.5 border-t border-hairline p-2"
          >
            <input
              type="text"
              placeholder="Transmit instruction to core..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 rounded-[6px] border border-hairline bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-signal focus:outline-none"
            />
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!input.trim() || sending}
              className="px-2.5"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

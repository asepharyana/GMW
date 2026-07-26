"use client";

import {
  Bot,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mascotApi } from "@/lib/api";
import type { ChatHistoryMessage } from "@/lib/types";

export function MascotChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    mascotApi
      .getHistory()
      .then(setMessages)
      .catch(() => {});
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollRef doesn't need messages in deps
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClear = useCallback(async () => {
    try {
      await mascotApi.clearHistory();
      setMessages([]);
    } catch {
      // ignore
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");

    // Add optimistic user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date().toISOString() },
    ]);

    try {
      const resp = await mascotApi.send(text);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: resp.response,
          timestamp: resp.timestamp,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't process that request.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-80 flex-col rounded-lg border bg-background shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 border-b p-3">
            <Bot className="size-5 text-primary" />
            <span className="text-sm font-semibold flex-1">Mascot</span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex size-6 items-center justify-center rounded hover:bg-muted transition-colors"
                title="Clear history"
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto p-3 max-h-80"
          >
            {messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                Ask me anything about the server!
              </p>
            )}
            {messages.map((msg, _i) => (
              <div
                key={msg.timestamp + msg.role}
                className={`flex items-start gap-2 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div className="size-6 shrink-0 rounded-full bg-muted flex items-center justify-center">
                  {msg.role === "user" ? (
                    <User className="size-3" />
                  ) : (
                    <Bot className="size-3" />
                  )}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2">
                <div className="size-6 shrink-0 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="size-3" />
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask the mascot…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

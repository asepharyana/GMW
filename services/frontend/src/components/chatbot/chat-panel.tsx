"use client";

import { Eraser, Send, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { useChatbot } from "./chatbot-context";

interface ChatPanelProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SUGGESTIONS = [
  "Gimana suasana server hari ini?",
  "Channel mana yang paling ramai?",
  "Total pesan di server?",
  "Ada pesan bermasalah?",
];

export function ChatPanel({ inputRef: externalInputRef }: ChatPanelProps) {
  const { messages, sendMessage, clearMessages, isTyping } = useChatbot();
  const listRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  // Auto-scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on message arrival; scroll is a visual effect keyed on new content
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim() || isTyping) return;
    sendMessage(input.value);
    input.value = "";
  };

  const handleSuggestion = (text: string) => {
    if (isTyping) return;
    sendMessage(text);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col justify-center h-full gap-3 px-3 text-center">
            <p className="text-[11px] text-text-secondary/50">
              Halo! 👋 Aku tau soal server ini — pesan, flag, dan aktivitas.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  disabled={isTyping}
                  className="flex items-center gap-1 rounded-full border border-glass-border px-2.5 py-1 text-[10px] text-text-secondary/70 transition-colors hover:bg-glass-bg hover:text-text-primary disabled:opacity-40"
                >
                  <Sparkles className="size-2.5 text-primary/60" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={`${msg.timestamp}-${i}`}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`text-[11px] px-2.5 py-1.5 rounded-xl max-w-[85%] leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === "user"
                    ? "bg-primary/20 text-text-primary rounded-br-sm"
                    : "glass text-text-secondary rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
              <span className="mt-0.5 px-1 text-[9px] text-text-secondary/30">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className="glass rounded-xl rounded-bl-sm px-2.5 py-2">
              <span className="inline-flex gap-1">
                <span
                  className="size-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="size-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="size-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-1.5 px-2 py-2 border-t border-glass-border shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Tanya soal server, pesan, atau statistik…"
          className="flex-1 bg-transparent text-[11px] text-text-primary placeholder-text-secondary/30 outline-none"
          disabled={isTyping}
          autoComplete="off"
        />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void clearMessages()}
            className="size-6 flex items-center justify-center rounded hover:bg-glass-bg transition-colors disabled:opacity-40"
            disabled={isTyping}
            aria-label="Hapus riwayat chat"
            title="Hapus riwayat"
          >
            <Eraser className="size-3 text-text-secondary/50 hover:text-destructive" />
          </button>
        )}
        <button
          type="submit"
          className="size-7 flex items-center justify-center rounded-lg bg-primary/15 hover:bg-primary/25 transition-colors disabled:opacity-40"
          disabled={isTyping}
          aria-label="Kirim pesan"
          title="Kirim"
        >
          <Send className="size-3.5 text-primary" />
        </button>
      </form>
    </div>
  );
}

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
    <div className="flex h-full flex-col">
      {/* Chat messages */}
      <div
        ref={listRef}
        className="flex-1 space-y-1.5 overflow-y-auto px-2 py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-3 px-3 text-center">
            <p className="text-[11px] text-[var(--color-ink-soft)]">
              Halo! 👋 Aku tau soal server ini — pesan, flag, dan aktivitas.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  disabled={isTyping}
                  className="flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[10px] text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-signal)] hover:text-[var(--color-signal-ink)] disabled:opacity-40"
                >
                  <Sparkles className="size-2.5 text-[var(--color-signal)]" />
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
                className={`max-w-[85%] break-words whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-br-sm bg-[var(--color-signal)] text-[var(--color-signal-ink)]"
                    : "rounded-bl-sm bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                }`}
              >
                {msg.content}
              </div>
              <span className="mt-0.5 px-1 text-[9px] text-[var(--color-ink-soft)]">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-sm bg-[var(--color-surface-2)] px-2.5 py-2">
              <span className="inline-flex gap-1">
                <span
                  className="size-1.5 animate-bounce rounded-full bg-[var(--color-ink-soft)]"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-[var(--color-ink-soft)]"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-[var(--color-ink-soft)]"
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
        className="flex shrink-0 items-center gap-1.5 border-t border-[var(--color-hairline)] px-2 py-2"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Tanya soal server, pesan, atau statistik…"
          className="flex-1 bg-transparent text-[11px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]/50"
          disabled={isTyping}
          autoComplete="off"
        />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void clearMessages()}
            className="flex size-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
            disabled={isTyping}
            aria-label="Hapus riwayat chat"
            title="Hapus riwayat"
          >
            <Eraser className="size-3 text-[var(--color-ink-soft)] hover:text-[var(--color-vermilion)]" />
          </button>
        )}
        <button
          type="submit"
          className="flex size-7 items-center justify-center rounded-lg bg-[var(--color-signal)] text-[var(--color-signal-ink)] transition-colors hover:opacity-90 disabled:opacity-40"
          disabled={isTyping}
          aria-label="Kirim pesan"
          title="Kirim"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useMascot } from "./mascot-context";

interface ChatPanelProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function ChatPanel({ inputRef: externalInputRef }: ChatPanelProps) {
  const { messages, sendMessage, isTyping } = useMascot();
  const listRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    sendMessage(input.value);
    input.value = "";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-text-secondary/40">Ask mascot anything</p>
          </div>
        )}
        {messages.slice(-8).map((msg, i) => (
          <div
            key={`${msg.timestamp}-${i}`}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`text-[10px] px-2 py-1 rounded-lg max-w-[85%] leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary/20 text-text-primary"
                  : "glass text-text-secondary"
              }`}
            >
              {msg.content}
            </span>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="glass rounded-lg px-2 py-1">
              <span className="inline-flex gap-0.5">
                <span className="size-1 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-1 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-1 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1 px-2 py-1.5 border-t border-glass-border shrink-0">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask mascot..."
          className="flex-1 bg-transparent text-[10px] text-text-primary placeholder-text-secondary/30 outline-none"
          disabled={isTyping}
        />
        <button
          type="submit"
          className="size-5 flex items-center justify-center disabled:opacity-40"
          disabled={isTyping}
          aria-label="Send message"
        >
          <Send className="size-3 text-primary" />
        </button>
      </form>
    </div>
  );
}

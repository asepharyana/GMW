"use client";

import { Bot, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "./chat-panel";
import { useChatbot } from "./chatbot-context";

export function ChatbotContainer() {
  const { minimized, setMinimized } = useChatbot();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [dragging, dragStart],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Focus input when chat opens
  useEffect(() => {
    if (!minimized) {
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [minimized]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag container — mouse-move gesture surface, not keyboard-interactive content
    <div
      className="fixed bottom-4 right-4 z-40 select-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className={`surface-2 overflow-hidden shadow-2xl transition-all duration-200 ${
          minimized ? "h-14 w-14 cursor-pointer" : "h-[460px] w-[320px]"
        }`}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex size-full items-center justify-center"
            onMouseDown={handleMouseDown}
            aria-label="Buka chatbot"
            title="Buka chatbot"
          >
            <Bot className="size-6 text-[var(--color-signal)]" />
          </button>
        ) : (
          <div className="flex h-full flex-col">
            {/* Drag handle + controls */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle — mouse-only gesture, keyboard users use the buttons in this header */}
            <div
              className="flex shrink-0 cursor-grab items-center justify-between border-b border-[var(--color-hairline)] px-3 py-2 active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                <Bot className="size-3.5 text-[var(--color-signal)]" />
                Chatbot
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  className="flex size-6 items-center justify-center rounded transition-colors hover:bg-[var(--color-surface-2)]"
                  aria-label="Kecilkan chatbot"
                  title="Kecilkan chatbot"
                >
                  <Minimize2 className="size-3.5 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]" />
                </button>
              </div>
            </div>

            {/* Chat panel — always open when bubble is expanded */}
            <div className="min-h-0 flex-1">
              <ChatPanel inputRef={inputRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

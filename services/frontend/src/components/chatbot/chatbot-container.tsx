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
      {/* Main chatbot bubble — minimized FAB opens the full chat directly */}
      <div
        className={`glass-intense rounded-2xl overflow-hidden transition-all duration-200 ${
          minimized ? "w-14 h-14 cursor-pointer" : "w-[320px] h-[460px]"
        }`}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="w-full h-full flex items-center justify-center"
            onMouseDown={handleMouseDown}
            aria-label="Buka chatbot"
            title="Buka chatbot"
          >
            <Bot className="size-6 text-primary" />
          </button>
        ) : (
          <div className="flex flex-col h-full">
            {/* Drag handle + controls */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle — mouse-only gesture, keyboard users use the buttons in this header */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-glass-border cursor-grab active:cursor-grabbing shrink-0"
              onMouseDown={handleMouseDown}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-text-secondary tracking-wide uppercase">
                <Bot className="size-3.5 text-primary" />
                Chatbot
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  className="size-6 flex items-center justify-center rounded hover:bg-glass-bg transition-colors"
                  aria-label="Kecilkan chatbot"
                  title="Kecilkan chatbot"
                >
                  <Minimize2 className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
                </button>
              </div>
            </div>

            {/* Chat panel — always open when bubble is expanded */}
            <div className="flex-1 min-h-0">
              <ChatPanel inputRef={inputRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

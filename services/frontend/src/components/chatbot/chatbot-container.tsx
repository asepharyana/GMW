"use client";

import { Bot, MessageCircle, Minimize2, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "./chat-panel";
import { useChatbot } from "./chatbot-context";

export function ChatbotContainer() {
  const { minimized, setMinimized, chatOpen, setChatOpen } = useChatbot();
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
    if (chatOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [chatOpen]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag container — mouse-move gesture surface, not keyboard-interactive content
    <div
      className="fixed bottom-4 right-4 z-40 select-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main chatbot bubble */}
      <div
        className={`glass-intense rounded-2xl overflow-hidden transition-all duration-200 ${
          minimized ? "w-14 h-14 cursor-pointer" : "w-[320px]"
        }`}
        style={{ height: minimized ? 56 : 400 }}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="w-full h-full flex items-center justify-center"
            onMouseDown={handleMouseDown}
            aria-label="Open chatbot"
          >
            <Bot className="size-6 text-primary" />
          </button>
        ) : (
          <>
            {/* Drag handle + controls */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle — mouse-only gesture, keyboard users use the buttons in this header */}
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-glass-border cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-text-secondary tracking-wide uppercase">
                <Bot className="size-3.5 text-primary" />
                Chatbot
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setChatOpen(!chatOpen)}
                  className="size-6 flex items-center justify-center rounded hover:bg-glass-bg transition-colors"
                  aria-label={chatOpen ? "Sembunyikan chat" : "Buka chat"}
                  title={chatOpen ? "Sembunyikan chat" : "Buka chat"}
                >
                  <PanelLeft className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
                </button>
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  className="size-6 flex items-center justify-center rounded hover:bg-glass-bg transition-colors"
                  aria-label="Kecilkan chatbot"
                >
                  <Minimize2 className="size-3.5 text-text-secondary/60 hover:text-text-primary" />
                </button>
              </div>
            </div>

            {/* Chat panel (expandable) */}
            <div
              className={`transition-all duration-200 overflow-hidden ${
                chatOpen ? "h-[300px]" : "h-0"
              }`}
            >
              <ChatPanel inputRef={inputRef} />
            </div>

            {/* Quick prompt row when chat is closed */}
            {!chatOpen && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-glass-border px-2.5 py-1.5 text-[10px] text-text-secondary/60 transition-colors hover:bg-glass-bg hover:text-text-primary"
              >
                <MessageCircle className="size-3 shrink-0 text-primary/60" />
                Tanya soal server, pesan, atau statistik…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

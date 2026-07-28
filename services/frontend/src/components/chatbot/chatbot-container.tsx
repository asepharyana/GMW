"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Bot, MessageCircle, Minimize2 } from "lucide-react";
import { useChatbot } from "./chatbot-context";
import { ChatbotCanvas } from "./chatbot-canvas";
import { ChatPanel } from "./chat-panel";

export function ChatbotContainer() {
  const { minimized, setMinimized, chatOpen, setChatOpen } = useChatbot();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen) {
      // Small delay for the animation
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [chatOpen]);

  return (
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
          minimized ? "w-14 h-14 cursor-pointer" : "w-[220px]"
        }`}
        style={{ height: minimized ? 56 : 320 }}
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
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b border-glass-border cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span className="text-[10px] font-semibold text-text-secondary tracking-wide uppercase">
                Chatbot
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setChatOpen(!chatOpen)}
                  className="size-5 flex items-center justify-center rounded hover:bg-glass-bg transition-colors"
                  aria-label={chatOpen ? "Close chat" : "Open chat"}
                >
                  <MessageCircle className="size-3 text-text-secondary/60 hover:text-text-primary" />
                </button>
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  className="size-5 flex items-center justify-center rounded hover:bg-glass-bg transition-colors"
                  aria-label="Minimize chatbot"
                >
                  {minimized ? (
                    <Bot className="size-3 text-text-secondary/60 hover:text-text-primary" />
                  ) : (
                    <Minimize2 className="size-3 text-text-secondary/60 hover:text-text-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Canvas area */}
            <div className="h-[140px] flex items-center justify-center">
              <ChatbotCanvas />
            </div>

            {/* Chat panel (expandable) */}
            <div
              className={`transition-all duration-200 overflow-hidden ${
                chatOpen ? "h-[130px]" : "h-0"
              }`}
            >
              <ChatPanel inputRef={inputRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { MessageCircle, X, Minimize2, Maximize2 } from "lucide-react";
import { useMascot } from "./mascot-context";
import { MascotCanvas } from "./mascot-canvas";
import { ChatPanel } from "./chat-panel";
import { useState } from "react";

export function MascotContainer() {
  const { minimized, setMinimized, chatOpen, setChatOpen } = useMascot();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      className="fixed bottom-4 right-4 z-40 select-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Main mascot bubble */}
      <div
        className={`glass-intense rounded-2xl overflow-hidden transition-all duration-200 ${
          minimized ? "w-16 h-16 cursor-pointer" : "w-[200px]"
        }`}
        style={{ height: minimized ? 64 : 280 }}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="w-full h-full flex items-center justify-center"
            onMouseDown={handleMouseDown}
          >
            <MessageCircle className="size-6 text-primary" />
          </button>
        ) : (
          <>
            {/* Drag handle + controls */}
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b border-glass-border cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <span className="text-[10px] font-semibold text-text-secondary tracking-wide uppercase">Mascot</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setChatOpen(!chatOpen)}>
                  <MessageCircle className="size-3 text-text-secondary/60 hover:text-text-primary" />
                </button>
                <button type="button" onClick={() => setMinimized(true)}>
                  <Minimize2 className="size-3 text-text-secondary/60 hover:text-text-primary" />
                </button>
              </div>
            </div>

            {/* Canvas area */}
            <div className="h-[140px] flex items-center justify-center">
              <MascotCanvas />
            </div>

            {/* Chat panel (expandable) */}
            <div className={`transition-all duration-200 overflow-hidden ${chatOpen ? "h-[120px]" : "h-0"}`}>
              <ChatPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

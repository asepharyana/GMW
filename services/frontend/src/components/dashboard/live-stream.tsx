"use client";

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

interface LiveMessage {
  id: string;
  content: string;
  username: string;
  channelName?: string;
  timestamp: string;
  flagged?: boolean;
}

export function LiveStream() {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ws = useWebSocket();

  useEffect(() => {
    const unsub = ws.on("message_created", (data: MessageRecord) => {
      // channel name lives inside the metadata JSON (channel.channelName)
      let channelName: string | undefined;
      try {
        const meta =
          typeof data.metadata === "string"
            ? JSON.parse(data.metadata)
            : data.metadata;
        channelName = meta?.channel?.channelName;
      } catch {
        channelName = undefined;
      }
      const msg: LiveMessage = {
        id: data.id,
        content: data.content || "(attachment)",
        username: data.username || "unknown",
        channelName,
        timestamp: new Date().toLocaleTimeString(),
        flagged: data.ai_status === "flagged" || data.ai_status === "warn",
      };
      setMessages((prev) => [msg, ...prev].slice(0, 50));
    });
    return () => unsub();
  }, [ws]);

  return (
    <GlassCard variant="base" className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-glass-border">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75 animate-pulse-ring" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">
          Live Stream
        </span>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto max-h-[320px] space-y-0.5 p-2"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-secondary/40 text-xs">
            Waiting for messages...
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded-md text-sm transition-all",
                msg.flagged
                  ? "bg-destructive/5 border-l-2 border-destructive/40"
                  : "hover:bg-glass-bg",
              )}
            >
              <span className="font-medium text-xs shrink-0 text-primary">
                {msg.username}
              </span>
              <span className="text-xs text-text-secondary truncate flex-1">
                {msg.content}
              </span>
              <span className="text-[10px] text-text-secondary/40 shrink-0">
                {msg.timestamp}
              </span>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}

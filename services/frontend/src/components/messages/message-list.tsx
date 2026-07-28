"use client";

import { MessageCard } from "./message-card";
import type { MessageRecord } from "@/lib/types";

interface MessageListProps {
  messages: MessageRecord[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export function MessageList({ messages, selectedId, onSelect }: MessageListProps) {
  return (
    <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-text-secondary/40 text-sm">
          No messages
        </div>
      ) : (
        messages.map((msg) => (
          <MessageCard
            key={msg.id}
            message={msg}
            selected={selectedId === msg.id}
            onClick={onSelect}
          />
        ))
      )}
    </div>
  );
}

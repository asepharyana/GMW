"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MessageRecord } from "@/lib/types";
import { MessageCard } from "./message-card";

interface MessageListProps {
  messages: MessageRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export function MessageList({
  messages,
  selectedId: _selectedId,
  onSelect,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: MessageListProps) {
  return (
    <>
      {messages.map((msg) => (
        <MessageCard key={msg.id} message={msg} onClick={onSelect} />
      ))}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="text-xs glass"
          >
            {isLoadingMore && <Loader2 className="size-3 animate-spin mr-1" />}
            Load more
          </Button>
        </div>
      )}
    </>
  );
}

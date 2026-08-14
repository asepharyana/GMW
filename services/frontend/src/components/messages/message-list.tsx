"use client";

import type { MessageRecord } from "@/lib/types";
import { MessageEntry } from "./message-entry";

export { MessageEntry };

export function MessageList({
  messages,
  selectedId,
  onSelect,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: {
  messages: MessageRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}) {
  if (messages.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-[var(--color-ink-soft)]">
          No messages found.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-0.5">
        {messages.map((m) => (
          <MessageEntry
            key={m.id}
            message={m}
            selected={selectedId === m.id}
            onSelect={() => onSelect(m.id)}
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="mt-3 w-full text-center text-xs text-[var(--color-amber)] hover:underline disabled:opacity-50"
        >
          {isLoadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

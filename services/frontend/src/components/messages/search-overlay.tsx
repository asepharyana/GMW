"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { messagesApi } from "@/lib/api";
import { getMessageChannelLabel, renderMessageContent } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function SearchOverlay({ open, onClose, onSelect }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results } = useQuery<MessageRecord[]>({
    queryKey: ["messages-search", query],
    queryFn: async () => {
      const res = await messagesApi.search(query, 20);
      return res.results;
    },
    enabled: query.length >= 2,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose(); // this is called when Cmd+K is pressed globally — toggle
      }
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-intense rounded-[var(--radius-card)] overflow-hidden shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <Search className="size-4 text-text-secondary/60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary/40 outline-none"
          />
          <button type="button" onClick={onClose} className="size-6 flex items-center justify-center rounded hover:bg-glass-bg">
            <X className="size-3.5 text-text-secondary/60" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {!results || results.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary/40">
              {query.length < 2 ? "Type at least 2 characters" : "No results found"}
            </div>
          ) : (
            results.map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => { onSelect(msg.id); onClose(); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-glass-bg transition-colors"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-text-primary">{msg.username}</span>
                  <span className="text-text-secondary/40">{getMessageChannelLabel(msg)}</span>
                </div>
                <p className="text-xs text-text-secondary/80 line-clamp-1 mt-0.5">{renderMessageContent(msg.content, msg.metadata)}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

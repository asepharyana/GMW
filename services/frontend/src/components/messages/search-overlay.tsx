"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { Input } from "@/components/primitives/input";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  content: string;
  username: string;
  channel: string;
  time: string;
}

export interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  results: Message[];
  onSelect: (msg: Message) => void;
}

export function SearchOverlay({
  open,
  onClose,
  results,
  onSelect,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");

  const filtered = query
    ? results.filter(
        (m) =>
          m.content.toLowerCase().includes(query.toLowerCase()) ||
          m.username.toLowerCase().includes(query.toLowerCase()),
      )
    : results;

  return (
    <Dialog open={open} onClose={onClose} className="p-0 max-w-xl">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <Input
            autoFocus
            placeholder="Search messages… (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 font-mono"
          />
        </div>
        <div className="mt-3 max-h-[420px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-ink-soft)]">
              No results.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.slice(0, 32).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m)}
                  className="group flex flex-col items-start gap-1 rounded-[var(--radius-r-control)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <span className="text-xs text-[var(--color-ink-soft)] group-hover:text-[var(--color-ink)]">
                    #{m.channel} · {m.username}
                  </span>
                  <span className="text-sm">{m.content}</span>
                  <span className="text-[10px] text-[var(--color-ink-soft)]/60">
                    {m.time}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

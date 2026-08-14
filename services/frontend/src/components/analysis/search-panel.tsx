"use client";

import { Loader2, Search, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";
import { Progress } from "@/components/primitives/progress";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { useMessageSearch } from "@/hooks";
import { renderMessageContent, safeParseJsonArray } from "@/lib/format";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState(false);

  const { data: results, isValidating: isFetching } = useMessageSearch(
    query,
    enabled,
  );

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setEnabled(true);
  }, [query]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-ink-soft)]" />
          <Input
            placeholder="Search message content, AI flags, analysis text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 h-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={!query.trim() || isFetching}>
          {isFetching && <Loader2 className="size-4 animate-spin mr-1.5" />}
          Search
        </Button>
      </div>

      {isFetching ? (
        <LoadingSkeleton count={5} height="h-28" />
      ) : results !== undefined ? (
        <>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Found {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          {results.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No messages found matching your query."
            />
          ) : (
            <div className="space-y-2">
              {results.map((msg) => (
                <div key={msg.id} className="surface p-4">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={msg.avatar_url ?? undefined}
                      name={msg.username}
                      size={32}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--color-ink)]">
                          {msg.username}
                        </span>
                        <span className="text-xs text-[var(--color-ink-soft)]">
                          {msg.created_at
                            ? new Date(msg.created_at).toLocaleString()
                            : ""}
                        </span>
                        {msg.ai_status && (
                          <Badge
                            tone={
                              msg.ai_status === "clean"
                                ? "signal"
                                : msg.ai_status === "flagged"
                                  ? "vermilion"
                                  : "neutral"
                            }
                          >
                            {msg.ai_status}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--color-ink)]">
                        {renderMessageContent(
                          msg.edited_content ?? msg.content,
                          msg.metadata,
                        )}
                      </p>
                      {msg.ai_moderation_flags &&
                        msg.ai_moderation_flags !== "[]" && (
                          <div className="flex flex-wrap gap-1">
                            {safeParseJsonArray(msg.ai_moderation_flags).map(
                              (flag) => (
                                <Badge key={flag} tone="vermilion">
                                  {flag}
                                </Badge>
                              ),
                            )}
                          </div>
                        )}
                      {msg.ai_analysis && (
                        <p className="text-xs text-[var(--color-ink-soft)] italic line-clamp-2 leading-relaxed">
                          <Sparkles className="size-3 inline mr-1" />
                          {msg.ai_analysis}
                        </p>
                      )}
                      {msg.ai_confidence != null && (
                        <div className="flex items-center gap-2 max-w-40">
                          <Progress value={msg.ai_confidence * 100} />
                          <span className="text-[11px] text-[var(--color-ink-soft)] tabular-nums shrink-0">
                            {(msg.ai_confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search className="size-12 text-[var(--color-ink-soft)] mb-4" />
          <p className="text-sm text-[var(--color-ink-soft)]">
            Enter a search query to find messages across all channels.
          </p>
          <p className="text-xs text-[var(--color-ink-soft)] mt-1">
            Searches message content, AI flags, and analysis text.
          </p>
        </div>
      )}
    </div>
  );
}

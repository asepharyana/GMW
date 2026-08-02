"use client";

import { Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";

import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useMessageSearch, useReanalyze } from "@/hooks";
import { renderMessageContent, safeParseJsonArray } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState(false);
  const reanalyzeMut = useReanalyze();

  const { data: results, isValidating: isFetching } = useMessageSearch(
    query,
    enabled,
  );

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    setEnabled(true);
  }, [query]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
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
          <p className="text-sm text-muted-foreground">
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
                <Card key={msg.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="size-8 shrink-0 mt-0.5">
                        <AvatarImage src={msg.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {msg.username?.charAt(0).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {msg.username}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {msg.created_at
                              ? new Date(msg.created_at).toLocaleString()
                              : ""}
                          </span>
                          {msg.ai_status && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-1.5 py-0 h-4",
                                msg.ai_status === "clean" && "text-green-500",
                                msg.ai_status === "flagged" && "text-red-500",
                              )}
                            >
                              {msg.ai_status}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed">
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
                                  <Badge
                                    key={flag}
                                    variant="destructive"
                                    className="text-[10px] px-1.5 py-0 h-4"
                                  >
                                    {flag}
                                  </Badge>
                                ),
                              )}
                            </div>
                          )}
                        {msg.ai_analysis && (
                          <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
                            <Sparkles className="size-3 inline mr-1" />
                            {msg.ai_analysis}
                          </p>
                        )}
                        {msg.ai_confidence != null && (
                          <div className="flex items-center gap-2 max-w-40">
                            <Progress
                              value={msg.ai_confidence * 100}
                              className="h-1.5"
                            />
                            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                              {(msg.ai_confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => reanalyzeMut.mutate(msg.id)}
                        >
                          <RefreshCw className="size-3 mr-1" />
                          Reanalyze
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search className="size-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">
            Enter a search query to find messages across all channels.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Searches message content, AI flags, and analysis text.
          </p>
        </div>
      )}
    </div>
  );
}

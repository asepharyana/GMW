"use client";

import { Hash, Search, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Avatar, Badge, GlassPanel, Input } from "@/components/primitives";
import { EmptyState, LoadingState, SectionHeader } from "@/components/shared";
import { useChannels, useMessageSearch, useTopReactors } from "@/hooks";
import { getMessageChannelLabel, renderMessageContent } from "@/lib/format";
import type { AiStatus } from "@/lib/types";

function aiTone(
  s?: AiStatus | null,
): "signal" | "amber" | "vermilion" | "neutral" {
  if (s === "clean") return "signal";
  if (s === "warn") return "amber";
  if (s === "flagged" || s === "error") return "vermilion";
  return "neutral";
}

/** Human-readable analysis duration, e.g. 850ms / 1.2s / 3.4s. */
function formatAnalysisDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AnalysisView() {
  const [query, setQuery] = useState("");
  const search = useMessageSearch(query, query.trim().length >= 2);
  const { data: reactors } = useTopReactors();
  const { data: channels } = useChannels();
  const ambient = useAmbient();

  useEffect(() => {
    ambient.set(
      query ? "amber" : "signal",
      0.3,
      query ? "analyzing" : "search",
    );
  }, [query, ambient]);

  return (
    <div className="space-y-5">
      <GlassPanel glow className="relative overflow-hidden">
        <div className="scan-line absolute inset-x-0 top-0" />
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-signal" />
          <div>
            <div className="eyebrow">Semantic search</div>
            <h2 className="display text-balance text-2xl text-ink">
              Search the archive
            </h2>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-faint" />
          <Input
            className="h-12 pl-12 text-base"
            placeholder="Find messages, patterns, flags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        {query.trim().length > 0 && query.trim().length < 2 && (
          <div className="mono mt-2 text-xs text-ink-faint">
            Type at least 2 characters…
          </div>
        )}
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-5">
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow="results"
            title="Matches"
            action={
              <span className="mono text-xs text-ink-faint">
                {(search.data ?? []).length}
              </span>
            }
          />
          {query.trim().length >= 2 && search.isLoading && (
            <LoadingState label="Scanning" />
          )}
          {(search.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Search className="size-7" />}
              title="No matches yet"
              description="Run a search to surface messages across the guild."
            />
          ) : (
            <div className="space-y-1.5">
              {(search.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-[12px] border border-hairline bg-white/[0.03] p-3"
                >
                  <Avatar src={m.avatar_url} name={m.username} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {m.username}
                      </span>
                      <span className="mono text-[0.65rem] text-ink-faint">
                        {getMessageChannelLabel(m)}
                      </span>
                      {m.ai_status && (
                        <Badge tone={aiTone(m.ai_status)} className="ml-auto">
                          {m.ai_analysis_duration_ms &&
                          m.ai_analysis_duration_ms > 0
                            ? `${m.ai_status} · ${formatAnalysisDuration(m.ai_analysis_duration_ms)}`
                            : m.ai_status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-soft">
                      {renderMessageContent(m.content, m.metadata) || "(embed)"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <div className="space-y-5 lg:col-span-2">
          <GlassPanel>
            <SectionHeader
              eyebrow="culture"
              title={
                <span className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-signal" /> Top reactors
                </span>
              }
            />
            <div className="space-y-2">
              {(reactors ?? []).slice(0, 6).map((r, i) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="mono w-5 text-ink-faint">{i + 1}</span>
                  <span className="flex-1 truncate text-ink">{r.username}</span>
                  <span className="mono text-xs text-signal">
                    +{r.net_count}
                  </span>
                </div>
              ))}
              {(reactors ?? []).length === 0 && (
                <div className="py-4 text-center text-xs text-ink-faint">
                  No data
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel>
            <SectionHeader
              eyebrow="channels"
              title={
                <span className="flex items-center gap-2">
                  <Hash className="size-4 text-signal" /> Top channels
                </span>
              }
            />
            <div className="space-y-2">
              {(channels ?? []).slice(0, 6).map((c) => (
                <div
                  key={c.channel_id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="flex-1 truncate text-ink-soft">
                    {c.channel_name ?? c.channel_id.slice(0, 8)}
                  </span>
                  <span className="mono text-xs text-ink-faint">
                    {c.total_messages}
                  </span>
                </div>
              ))}
              {(channels ?? []).length === 0 && (
                <div className="py-4 text-center text-xs text-ink-faint">
                  No data
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

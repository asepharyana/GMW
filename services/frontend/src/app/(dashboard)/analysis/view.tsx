"use client";

/**
 * Analysis scene — semantic search lives in a floating console (left);
 * results stream into a translucent dossier (right). The stage shows an
 * analysis hub wired to the guild's top channels.
 */
import { Hash, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Avatar, Badge } from "@/components/primitives";
import { EmptyState, SkeletonRows } from "@/components/shared";
import { useScenePublish } from "@/components/shell/scene-graph-context";
import { useChannels, useMessageSearch } from "@/hooks";
import { aiTone } from "@/lib/ai-status";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import {
  formatDuration,
  getMessageChannelLabel,
  renderMessageContent,
} from "@/lib/format";

function analysisGraph(
  channels:
    | {
        channel_id: string;
        channel_name?: string | null;
        total_messages: number;
      }[]
    | undefined,
): ConstellationGraph {
  const rows = (channels ?? []).slice(0, 10);
  const maxMsg = rows.reduce((m, c) => Math.max(m, c.total_messages), 0);
  const clamp = (n: number) => (maxMsg <= 0 ? 0.3 : Math.max(0.15, n / maxMsg));
  return {
    nodes: [
      { id: "hub", label: "analysis", kind: "guild", value: 1 },
      ...rows.map((c) => ({
        id: `channel:${c.channel_id}`,
        label: c.channel_name ?? c.channel_id.slice(0, 8),
        kind: "channel" as const,
        href: "/channels/",
        value: clamp(c.total_messages),
      })),
    ],
    edges: rows.map((c) => ({
      source: "hub",
      target: `channel:${c.channel_id}`,
    })),
  };
}

export function AnalysisView() {
  const [query, setQuery] = useState("");
  const search = useMessageSearch(query, query.trim().length >= 2);
  const { data: channels } = useChannels();
  const ambient = useAmbient();
  const publish = useScenePublish();

  const graph = useMemo(() => analysisGraph(channels), [channels]);

  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(
    () => () => publish({ graph: { nodes: [], edges: [] }, focus: null }),
    [publish],
  );

  useEffect(() => {
    ambient.set(
      query ? "amber" : "signal",
      0.3,
      query ? "analyzing" : "search",
    );
  }, [query, ambient]);

  return (
    <div className="min-h-full">
      {/* Search console — left */}
      <section
        className="pointer-events-auto absolute left-5 top-16 w-[min(26rem,88vw)]"
        aria-label="Semantic search"
      >
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-signal" /> Search the archive
        </p>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find messages, patterns, flags…"
            autoFocus
            className="h-11 w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/70 pl-11 pr-4 text-sm text-[var(--color-ink)] backdrop-blur-md outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-signal)]"
          />
        </div>
        {query.trim().length > 0 && query.trim().length < 2 ? (
          <p className="mt-2 font-mono text-xs text-[var(--color-ink-faint)]">
            minimal 2 karakter…
          </p>
        ) : null}
      </section>

      {/* Results dossier — right */}
      <section
        className="pointer-events-auto absolute bottom-20 right-5 hidden max-h-[62vh] w-[min(30rem,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/75 backdrop-blur-xl md:flex"
        aria-label="Search results"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2.5">
          <span className="eyebrow">matches</span>
          <span className="font-mono text-xs text-[var(--color-ink-faint)]">
            {(search.data ?? []).length}
          </span>
        </div>
        <div className="overflow-y-auto p-3">
          {query.trim().length >= 2 && search.isLoading ? (
            <SkeletonRows rows={5} />
          ) : (search.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Search className="size-6" />}
              title="No matches yet"
              description="Run a search to surface messages across the guild."
            />
          ) : (
            <div className="space-y-1.5">
              {(search.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl border border-[var(--color-hairline)] p-2.5"
                >
                  <Avatar src={m.avatar_url} name={m.username} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-ink)]">
                        {m.username}
                      </span>
                      <span className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                        {getMessageChannelLabel(m)}
                      </span>
                      {m.ai_status ? (
                        <Badge tone={aiTone(m.ai_status)} className="ml-auto">
                          {m.ai_analysis_duration_ms &&
                          m.ai_analysis_duration_ms > 0
                            ? `${m.ai_status} · ${formatDuration(m.ai_analysis_duration_ms)}`
                            : m.ai_status}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                      {renderMessageContent(m.content, m.metadata) || "(embed)"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Channels hint — bottom-left */}
      <p className="pointer-events-none absolute bottom-24 left-5 hidden items-center gap-1.5 font-mono text-xs text-[var(--color-ink-faint)] lg:flex">
        <Hash className="size-3.5" /> {(channels ?? []).length} channels
        terhubung ke hub analitik — klik untuk membuka konstelasi channel
      </p>
    </div>
  );
}

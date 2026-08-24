"use client";

/**
 * Channels scene — every channel is a star on the stage; clicking a star
 * opens its floating culture dossier here. Search filters the sky.
 */
import { useEffect, useMemo, useState } from "react";
import { SkeletonPanel } from "@/components/shared";
import {
  useSceneFocusSetter,
  useSceneGraph,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import { useChannelCultures } from "@/hooks";
import { culturesToGraph } from "@/lib/constellation/graph";
import type { ChannelCultureRow } from "@/lib/types";

export function ChannelsView({
  initialCultures,
}: {
  initialCultures?: ChannelCultureRow[];
}) {
  const { data: cultures } = useChannelCultures(100, initialCultures);
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();
  const { state } = useSceneGraph();
  const [query, setQuery] = useState("");

  const rows = cultures ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.channel_name ?? r.channel_id).toLowerCase().includes(q) ||
        (r.culture_summary ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const graph = useMemo(() => culturesToGraph(filtered), [filtered]);

  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(() => () => setFocus(null), [setFocus]);

  const selectedId = state?.focus ?? null;
  const selectedRow = useMemo(
    () =>
      selectedId
        ? (rows.find((r) => `channel:${r.channel_id}` === selectedId) ?? null)
        : null,
    [rows, selectedId],
  );

  return (
    <div className="min-h-full">
      {/* Search whisper — top-left */}
      <section
        className="pointer-events-auto absolute left-5 top-16 w-64"
        aria-label="Filter channels"
      >
        <p className="eyebrow mb-2">Channels · {filtered.length} mapped</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter the sky…"
          className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/60 px-3.5 py-1.5 font-mono text-xs text-[var(--color-ink)] backdrop-blur-md outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-signal)]"
        />
        {!cultures ? (
          <div className="mt-3">
            <SkeletonPanel rows={3} />
          </div>
        ) : null}
      </section>

      {/* Culture dossier for the selected star */}
      {selectedRow ? (
        <aside
          className="pointer-events-auto absolute bottom-20 left-1/2 w-[min(34rem,92vw)] -translate-x-1/2 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/80 p-4 backdrop-blur-xl md:left-auto md:right-5 md:translate-x-0"
          aria-label={`Culture of ${selectedRow.channel_name ?? selectedRow.channel_id}`}
        >
          <button
            type="button"
            className="absolute right-3 top-3 font-mono text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            onClick={() => setFocus(null)}
          >
            esc
          </button>
          <p className="eyebrow">channel culture</p>
          <h3 className="display mt-1 text-xl leading-tight text-ink glow-signal">
            {selectedRow.channel_name ?? selectedRow.channel_id}
          </h3>
          <p className="mt-2 max-h-40 overflow-y-auto text-sm text-pretty text-ink-soft">
            {selectedRow.culture_summary ?? "Belum dianalisis."}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {selectedRow.last_analyzed_at
              ? `analyzed ${new Date(selectedRow.last_analyzed_at).toLocaleString()}`
              : "never analyzed"}
          </p>
        </aside>
      ) : (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 hidden justify-center font-mono text-xs text-[var(--color-ink-faint)] md:flex">
          klik sebuah bintang untuk membuka culture dossier
        </p>
      )}
    </div>
  );
}

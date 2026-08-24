"use client";

/**
 * Glossary scene — term KB as a satellite ring on the stage; the search
 * whisper filters nodes live, and a term's definition floats in a dossier.
 */
import { useEffect, useMemo, useState } from "react";
import { SkeletonPanel } from "@/components/shared";
import {
  useSceneFocusSetter,
  useSceneGraph,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import { useGlossary } from "@/hooks";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import type { GlossaryRow } from "@/lib/types";

/** Terms → satellite ring (deterministic positions come from layout). */
function termsToGraph(rows: GlossaryRow[]): ConstellationGraph {
  return {
    nodes: rows.slice(0, 60).map((t) => ({
      id: `term:${t.term}`,
      label: t.term,
      kind: "term" as const,
      value: Math.min(1, 0.3 + t.definition.length / 400),
    })),
    edges: [],
  };
}

export function GlossaryView({
  initialTerms,
}: {
  initialTerms?: GlossaryRow[];
}) {
  const { data: terms } = useGlossary(100, initialTerms);
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();
  const { state } = useSceneGraph();
  const [query, setQuery] = useState("");

  const rows = terms ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const graph = useMemo(() => termsToGraph(filtered), [filtered]);

  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(() => () => setFocus(null), [setFocus]);

  const selectedId = state?.focus ?? null;
  const selectedTerm = useMemo(
    () =>
      selectedId
        ? (rows.find((t) => `term:${t.term}` === selectedId) ?? null)
        : null,
    [rows, selectedId],
  );

  return (
    <div className="min-h-full">
      <section
        className="pointer-events-auto absolute left-5 top-16 w-64"
        aria-label="Filter terms"
      >
        <p className="eyebrow mb-2">Glossary · {filtered.length} terms</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter terms…"
          className="w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/60 px-3.5 py-1.5 font-mono text-xs text-[var(--color-ink)] backdrop-blur-md outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-signal)]"
        />
        {!terms ? (
          <div className="mt-3">
            <SkeletonPanel rows={3} />
          </div>
        ) : null}
      </section>

      {selectedTerm ? (
        <aside
          className="pointer-events-auto absolute bottom-20 left-1/2 w-[min(34rem,92vw)] -translate-x-1/2 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/80 p-4 backdrop-blur-xl md:left-auto md:right-5 md:translate-x-0"
          aria-label={`Definition of ${selectedTerm.term}`}
        >
          <button
            type="button"
            className="absolute right-3 top-3 font-mono text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            onClick={() => setFocus(null)}
          >
            esc
          </button>
          <p className="eyebrow">term kb</p>
          <h3 className="display mt-1 text-xl leading-tight text-ink glow-signal">
            {selectedTerm.term}
          </h3>
          <p className="mt-2 max-h-40 overflow-y-auto text-sm text-pretty text-ink-soft">
            {selectedTerm.definition}
          </p>
        </aside>
      ) : (
        <p className="pointer-events-none absolute inset-x-0 bottom-24 hidden justify-center font-mono text-xs text-[var(--color-ink-faint)] md:flex">
          klik sebuah satelit untuk membuka definisi
        </p>
      )}
    </div>
  );
}

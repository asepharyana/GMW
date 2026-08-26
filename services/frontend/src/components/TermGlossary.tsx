"use client";

import { ChevronDown, Download, Globe, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge, GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { GlossaryRow } from "@/lib/types";

function GlossaryEntry({ t }: { t: GlossaryRow }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className="glossary-entry overflow-hidden rounded-[6px] border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate font-mono text-xs font-semibold text-ink">
            {t.term}
          </span>
          <Badge tone="signal" className="font-mono text-[9px]">
            {t.hit_count} hits
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 font-mono text-[10px] text-ink-faint">
          <span>{formatRelativeTime(t.resolved_at)}</span>
          <ChevronDown
            className={`size-3.5 text-ink-muted transition-transform duration-200 ${open ? "rotate-180 text-ink" : ""}`}
          />
        </div>
      </button>
      <div
        ref={bodyRef}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.04] bg-black/20 px-3.5 py-2.5 text-xs">
            <p className="font-sans text-ink-soft leading-relaxed">
              {t.definition}
            </p>
            {t.source_url && (
              <a
                href={t.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] text-[#7170ff] hover:underline"
              >
                <Globe className="size-3" />
                {t.source_url}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TermGlossary({ terms }: { terms: GlossaryRow[] }) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return terms;
    const q = filter.toLowerCase();
    return terms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition?.toLowerCase().includes(q),
    );
  }, [terms, filter]);

  const listRef = useStaggerReveal<HTMLDivElement>(".glossary-entry", {
    stagger: 0.025,
    y: 8,
    dependencies: [filtered.length, filter],
  });

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#7170ff] shadow-[0_0_8px_#7170ff]" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-[#f7f8f8] uppercase">
            Slang & Term Glossary · Knowledge Base
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8a8f98]">
          <span>INDEXED:</span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-medium text-[#7170ff] border border-white/[0.06]">
            {terms.length} TERMS_RECORDED
          </span>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search slang term or definition keywords..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.02] py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-[#7170ff] focus:outline-none"
          />
        </div>
        {terms.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                "glossary.csv",
                terms.map((t) => ({
                  term: t.term,
                  definition: t.definition,
                  source: t.source_url,
                  resolved: t.resolved_at,
                  hits: t.hit_count,
                })),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-[11px] text-ink-soft transition-colors hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-ink"
          >
            <Download className="size-3.5 text-[#7170ff]" />
            EXPORT_CSV
          </button>
        )}
      </GlassPanel>

      <GlassPanel>
        <SectionHeader
          eyebrow="knowledge directory"
          title="Slang & Definition Index"
          action={
            <span className="mono text-xs text-[#8a8f98]">
              {filtered.length} of {terms.length} terms
            </span>
          }
        />
        {filtered.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-ink-faint">
            NO TERM DEFINITIONS MATCH YOUR FILTER
          </div>
        ) : (
          <div ref={listRef} className="space-y-1.5 mt-3">
            {filtered.map((t) => (
              <GlossaryEntry key={t.term} t={t} />
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

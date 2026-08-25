"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useRef, useState } from "react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { GlossaryRow } from "@/lib/types";

function GlossaryEntry({ t }: { t: GlossaryRow }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className="glossary-entry overflow-hidden rounded-md border border-hairline bg-surface/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface/50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-ink">{t.term}</span>
          <span className="mono shrink-0 text-[10px] text-ink-faint">
            {t.hit_count} uses
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-ink-faint">
          {formatRelativeTime(t.resolved_at)}
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      <div
        ref={bodyRef}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-hairline px-3 py-2.5 text-sm">
            <p className="text-ink-faint">{t.definition}</p>
            {t.source_url && (
              <a
                href={t.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
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
  const listRef = useStaggerReveal<HTMLDivElement>(".glossary-entry", {
    stagger: 0.035,
    y: 10,
    dependencies: [terms],
  });

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-signal" />
          </div>
          <h1 className="font-mono text-xs font-semibold tracking-widest text-ink uppercase">
            TERM GLOSSARY · KB_INDEX
          </h1>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
          <span className="text-ink-faint">TERMS:</span>
          <span className="font-bold text-signal">{terms.length}</span>
        </div>
      </div>

      <GlassPanel className="lg:col-span-3">
        <SectionHeader
          eyebrow="knowledge"
          title="Term Knowledge Base"
          action={
            terms.length > 0 ? (
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
                className="flex items-center gap-1.5 font-mono text-[11px] text-ink-soft hover:text-ink"
              >
                EXPORT_CSV
              </button>
            ) : null
          }
        />
        {terms.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-ink-faint">
            NO TERM RESOLUTIONS CACHED YET
          </p>
        ) : (
          <div ref={listRef} className="space-y-2">
            {terms.map((t) => (
              <GlossaryEntry key={t.term} t={t} />
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

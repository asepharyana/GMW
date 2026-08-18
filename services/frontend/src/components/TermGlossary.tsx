"use client";

import { Globe } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatRelativeTime } from "@/lib/format";
import type { GlossaryRow } from "@/lib/types";

export function TermGlossary({ terms }: { terms: GlossaryRow[] }) {
  return (
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
              className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
            >
              CSV
            </button>
          ) : null
        }
      />
      {terms.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No term resolutions cached yet.
        </p>
      ) : (
        <div className="space-y-3">
          {terms.map((t) => (
            <div key={t.term} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{t.term}</span>
                <span className="text-xs text-ink-faint">
                  {t.hit_count} uses · {formatRelativeTime(t.resolved_at)}
                </span>
              </div>
              <p className="mt-1 text-ink-faint">{t.definition}</p>
              {t.source_url && (
                <a
                  href={t.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 text-xs text-ink-soft hover:text-ink"
                >
                  <Globe className="mr-1 inline size-3" />
                  {t.source_url}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

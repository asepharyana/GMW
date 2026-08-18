"use client";

import { Download } from "lucide-react";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { downloadCsv } from "@/lib/csv";
import { formatNumber } from "@/lib/format";
import type { FlaggedDomain } from "@/lib/types";

export function ScamDomains({ domains }: { domains: FlaggedDomain[] }) {
  const max = domains.reduce((m, d) => Math.max(m, d.count), 0);
  return (
    <GlassPanel className="lg:col-span-2">
      <SectionHeader
        eyebrow="risk"
        title="Flagged Link Domains"
        action={
          domains.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  "flagged-domains.csv",
                  domains.map((d) => ({
                    domain: d.domain,
                    flagged_count: d.count,
                  })),
                )
              }
              className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
            >
              <Download className="size-3.5" />
              CSV
            </button>
          ) : null
        }
      />
      {domains.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No flagged links captured recently.
        </p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => {
            const pct = max > 0 ? Math.max(2, (d.count / max) * 100) : 0;
            return (
              <div key={d.domain} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 truncate font-mono text-ink-soft">
                  {d.domain}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[#8b5cf6]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="mono w-10 shrink-0 text-right text-ink">
                  {formatNumber(d.count)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

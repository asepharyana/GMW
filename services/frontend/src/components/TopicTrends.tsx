"use client";

import { Donut } from "@/components/charts/donut";
import { GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { formatNumber } from "@/lib/format";
import type { ModerationTrends } from "@/lib/types";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-vermilion)",
  high: "var(--color-vermilion)",
  medium: "var(--color-amber)",
  low: "var(--color-signal)",
  none: "var(--color-ink-faint)",
};

function BarRow({
  label,
  count,
  max,
  color = "var(--color-signal)",
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 truncate text-ink-soft">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="mono w-10 shrink-0 text-right text-ink">
        {formatNumber(count)}
      </span>
    </div>
  );
}

export function TopicTrends({ trends }: { trends: ModerationTrends }) {
  const maxCat = trends.categories.reduce((m, c) => Math.max(m, c.count), 0);
  const maxAct = trends.actions.reduce((m, a) => Math.max(m, a.count), 0);
  const totalSev = trends.severities.reduce((s, x) => s + x.count, 0);

  const severitySegments = trends.severities.map((s) => ({
    value: s.count,
    color: SEVERITY_COLOR[s.level] ?? "var(--color-ink-faint)",
    label: s.level,
  }));

  return (
    <GlassPanel className="lg:col-span-2">
      <SectionHeader eyebrow="insight" title="Toxic Topic Trends" />
      {trends.categories.length === 0 && trends.severities.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          No categorized actions in the last 30 days.
        </p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
              Top flagged categories
            </p>
            <div className="space-y-2">
              {trends.categories.slice(0, 10).map((c) => (
                <BarRow
                  key={c.name}
                  label={c.name}
                  count={c.count}
                  max={maxCat}
                />
              ))}
              {trends.categories.length === 0 && (
                <p className="text-xs text-ink-faint">
                  No categories recorded.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
                Severity
              </p>
              {totalSev > 0 ? (
                <div className="flex items-center gap-4">
                  <Donut
                    segments={severitySegments}
                    centerLabel={formatNumber(totalSev)}
                    centerSub="total"
                    size={88}
                  />
                  <div className="space-y-1 text-xs">
                    {trends.severities.map((s) => (
                      <div key={s.level} className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            background:
                              SEVERITY_COLOR[s.level] ??
                              "var(--color-ink-faint)",
                          }}
                        />
                        <span className="capitalize text-ink-soft">
                          {s.level}
                        </span>
                        <span className="mono ml-auto text-ink">
                          {formatNumber(s.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-faint">No severity data.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-ink-faint">
                Action types
              </p>
              <div className="space-y-2">
                {trends.actions.slice(0, 6).map((a) => (
                  <BarRow
                    key={a.type}
                    label={a.type.replace("_", " ")}
                    count={a.count}
                    max={maxAct}
                    color="#8b5cf6"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

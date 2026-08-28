"use client";

import { ChevronRight } from "lucide-react";
import { Badge, GlassPanel } from "@/components/primitives";
import { SectionHeader } from "@/components/shared";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type { CategoryAction, ModerationTrends } from "@/lib/types";

const SEVERITY_TONE: Record<
  string,
  "signal" | "amber" | "vermilion" | "neutral"
> = {
  critical: "vermilion",
  high: "vermilion",
  medium: "amber",
  low: "signal",
  none: "neutral",
};

interface CategoryDrilldownProps {
  trends: ModerationTrends;
  selected?: string | null;
  actions?: CategoryAction[];
  loading?: boolean;
  onSelect: (category: string | null) => void;
}

export function CategoryDrilldown({
  trends,
  selected,
  actions,
  loading,
  onSelect,
}: CategoryDrilldownProps) {
  const maxCat = trends.categories.reduce((m, c) => Math.max(m, c.count), 0);

  return (
    <GlassPanel className="lg:col-span-3">
      <SectionHeader eyebrow="drill-down" title="Flag Category" />
      {selected ? (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-ink-soft hover:text-ink"
          >
            ← Back to all categories
          </button>
          <span className="text-xs text-ink-faint">
            / {selected} (
            {loading ? "loading…" : formatNumber(actions?.length ?? 0)} actions)
          </span>
        </div>
      ) : (
        <p className="mb-2 text-xs text-ink-faint">
          Click a category to list the underlying moderation actions.
        </p>
      )}

      {!selected ? (
        <div className="space-y-2">
          {trends.categories.map((c) => {
            const pct = maxCat > 0 ? Math.max(2, (c.count / maxCat) * 100) : 0;
            return (
              <button
                type="button"
                key={c.name}
                onClick={() => onSelect(c.name)}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <span className="w-36 shrink-0 truncate text-ink-soft">
                  {c.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-signal"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="mono w-10 text-right text-ink">
                  {formatNumber(c.count)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {loading && <p className="text-xs text-ink-faint">Loading…</p>}
          {!loading && actions && actions.length === 0 && (
            <p className="text-xs text-ink-faint">
              No actions in this category.
            </p>
          )}
          {actions?.slice(0, 12).map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-sm">
              <Badge tone={SEVERITY_TONE[a.severity ?? "none"]}>
                {a.severity ?? "none"}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{a.action_type}</span>
                  {a.username && (
                    <span className="text-ink-soft">@{a.username}</span>
                  )}
                  <span
                    className="text-ink-faint mono text-xs"
                    suppressHydrationWarning
                  >
                    {a.created_at ? formatRelativeTime(a.created_at) : ""}
                  </span>
                </div>
                {a.content && (
                  <p className="mt-0.5 line-clamp-2 text-ink-faint">
                    {a.content}
                  </p>
                )}
                {a.reason && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-faint">
                    Reason: {a.reason}
                  </p>
                )}
                <ChevronRight className="mt-1 size-3 text-ink-faint/50" />
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

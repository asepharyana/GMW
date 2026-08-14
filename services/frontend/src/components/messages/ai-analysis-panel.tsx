"use client";

import { useState } from "react";
import { Badge } from "@/components/primitives/badge";
import { Progress } from "@/components/primitives/progress";
import { cn } from "@/lib/utils";

interface AiAnalysisPanelProps {
  status?: string | null;
  severity?: string | null;
  confidence?: number | null;
  flags?: string[] | string | null;
  categories?: string[] | string | null;
  action?: string | null;
  score?: number | null;
  analysis?: string | null;
}

const severityColor: Record<string, string> = {
  none: "text-[var(--color-ink-soft)]",
  low: "text-[var(--color-ink-soft)]",
  medium: "text-[var(--color-amber)]",
  high: "text-orange-500",
  critical: "text-[var(--color-vermilion)]",
};

export function AiAnalysisPanel({
  status,
  severity,
  confidence,
  flags,
  categories,
  action,
  score,
  analysis,
}: AiAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!status || status === "pending") {
    return (
      <div className="surface-2 p-3">
        <span className="text-xs text-[var(--color-ink-soft)]/60">
          AI analysis pending
        </span>
      </div>
    );
  }

  const flagsArray =
    typeof flags === "string" ? (flags ? JSON.parse(flags) : []) : flags || [];
  const categoriesArray =
    typeof categories === "string"
      ? categories
        ? JSON.parse(categories)
        : []
      : categories || [];

  const statusTone =
    status === "clean"
      ? "signal"
      : status === "flagged"
        ? "vermilion"
        : status === "warn"
          ? "amber"
          : "neutral";

  return (
    <div className="surface-2 flex flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          AI Analysis
        </span>
        <Badge tone={statusTone}>{status}</Badge>
      </div>

      {severity && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-ink-soft)]/60">Severity:</span>
          <span
            className={cn(
              "font-mono font-medium",
              severityColor[severity] || "",
            )}
          >
            {severity}
          </span>
        </div>
      )}

      {confidence !== null && confidence !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--color-ink-soft)]/60">Confidence</span>
          <Progress
            value={confidence * 100}
            max={100}
            tone="signal"
            showLabel
          />
        </div>
      )}

      {score !== null && score !== undefined && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-ink-soft)]/60">Score</span>
          <span className="font-mono">{score.toFixed(2)}</span>
        </div>
      )}

      {flagsArray.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flagsArray.map((f: string) => (
            <Badge key={f} tone="vermilion">
              {f}
            </Badge>
          ))}
        </div>
      )}

      {categoriesArray.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {categoriesArray.map((c: string) => (
            <Badge key={c} tone="neutral">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {analysis && (
        <div className="border-l-2 border-[var(--color-hairline)] pl-2">
          <p
            className={cn(
              "text-xs leading-relaxed text-[var(--color-ink-soft)]",
              !expanded && "line-clamp-3",
            )}
          >
            {analysis}
          </p>
          {analysis.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-soft)]/50 transition-colors hover:text-[var(--color-ink)]"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {action && action !== "none" && (
        <div className="text-xs">
          <span className="text-[var(--color-ink-soft)]/60">Recommended: </span>
          <span className="font-mono text-[var(--color-amber)]">{action}</span>
        </div>
      )}
    </div>
  );
}

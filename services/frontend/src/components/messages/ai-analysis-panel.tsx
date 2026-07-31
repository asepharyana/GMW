"use client";

import { GlassPanel } from "@/components/glass/panel";
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
  none: "text-emerald-500",
  low: "text-text-secondary",
  medium: "text-accent-amber",
  high: "text-accent-purple",
  critical: "text-destructive",
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
  if (!status || status === "pending") {
    return (
      <GlassPanel dense>
        <span className="text-xs text-text-secondary/50">AI analysis pending</span>
      </GlassPanel>
    );
  }

  const flagsArray = typeof flags === "string" ? (flags ? JSON.parse(flags) : []) : (flags || []);
  const categoriesArray = typeof categories === "string" ? (categories ? JSON.parse(categories) : []) : (categories || []);

  return (
    <GlassPanel dense className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-wide uppercase text-text-secondary">AI Analysis</span>
        <span className={cn(
          "text-[10px] font-mono px-1.5 py-0.5 rounded",
          status === "clean" && "bg-emerald-500/10 text-emerald-500",
          status === "flagged" && "bg-accent-purple/10 text-accent-purple",
          status === "warn" && "bg-accent-amber/10 text-accent-amber",
          status === "error" && "bg-destructive/10 text-destructive",
        )}>
          {status}
        </span>
      </div>

      {severity && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Severity:</span>
          <span className={cn("font-mono font-medium", severityColor[severity] || "")}>{severity}</span>
        </div>
      )}

      {confidence !== null && confidence !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Confidence:</span>
          <span className="font-mono">{(confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {score !== null && score !== undefined && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary/60">Score:</span>
          <span className="font-mono">{score.toFixed(2)}</span>
        </div>
      )}

      {flagsArray.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {flagsArray.map((f: string) => (
            <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{f}</span>
          ))}
        </div>
      )}

      {categoriesArray.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {categoriesArray.map((c: string) => (
            <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c}</span>
          ))}
        </div>
      )}

      {analysis && (
        <p className="text-xs leading-relaxed text-text-secondary/90 border-l-2 border-glass-border pl-2">
          {analysis}
        </p>
      )}

      {action && action !== "none" && (
        <div className="text-xs">
          <span className="text-text-secondary/60">Recommended: </span>
          <span className="font-mono text-accent-amber">{action}</span>
        </div>
      )}
    </GlassPanel>
  );
}

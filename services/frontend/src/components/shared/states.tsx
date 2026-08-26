import { AlertTriangle, Loader2 } from "lucide-react";
import { GlassPanel, Skeleton, Spinner } from "@/components/primitives";
import { cn } from "@/lib/utils";

/** A panel-shaped loading placeholder. */
export function SkeletonPanel({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <GlassPanel className={className}>
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-12" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

/** A 2×2 (or 4-col) grid of metric-tile placeholders. */
export function SkeletonMetricRow({ cols = 4 }: { cols?: number }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        cols === 4 && "md:grid-cols-4",
        cols === 3 && "md:grid-cols-3",
      )}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="glass flex flex-col gap-2 p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A stacked list of row placeholders (message/moderation/queue style). */
export function SkeletonRows({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-[12px] border border-hairline bg-surface-2 p-3"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-full max-w-[90%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hero block placeholder (dashboard / media "now playing"). */
export function SkeletonHero({ className }: { className?: string }) {
  return (
    <GlassPanel glow className={cn("relative overflow-hidden", className)}>
      <div className="scan-line absolute inset-x-0 top-0" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="size-28 shrink-0 rounded-full" />
      </div>
    </GlassPanel>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  icon,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-1 flex size-14 items-center justify-center rounded-full border border-hairline bg-surface-2 text-ink-soft shadow-[0_0_30px_-12px_var(--color-signal-glow)]">
          {icon}
        </span>
      )}
      <div className="text-sm font-medium text-ink-soft">{title}</div>
      {description && (
        <div className="max-w-xs text-xs text-ink-faint">{description}</div>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load",
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    <div className="glass flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="size-7 text-vermilion" />
      <div className="text-sm font-medium text-ink">{title}</div>
      {msg && (
        <div className="mono max-w-md break-words text-xs text-ink-faint">
          {msg}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-[10px] border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:text-ink hover:border-signal/40"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Syncing" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-ink-faint">
      <Spinner />
      <span className="mono text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}

export { Loader2 };

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Spinner } from "@/components/primitives";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      <div className="text-ink-faint">{icon ?? <Inbox className="size-7" />}</div>
      <div className="text-sm font-medium text-ink-soft">{title}</div>
      {description && <div className="max-w-xs text-xs text-ink-faint">{description}</div>}
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
      {msg && <div className="mono max-w-md break-words text-xs text-ink-faint">{msg}</div>}
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

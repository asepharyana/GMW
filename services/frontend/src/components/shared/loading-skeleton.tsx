import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  /** Number of skeleton rows */
  count?: number;
  /** Height per skeleton row */
  height?: string;
  /** Grid layout: columns */
  columns?: number;
  /** Additional classes */
  className?: string;
}

/**
 * Consistent loading skeleton for data-fetching pages.
 * Renders a grid of skeleton placeholders.
 */
export function LoadingSkeleton({
  count = 4,
  height = "h-28",
  columns = 1,
  className,
}: LoadingSkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn(height, "rounded-xl")} />
      ))}
    </div>
  );
}

import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className, rounded }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-[var(--radius-r-control)]",
        "bg-[var(--color-surface-2)]",
        rounded && "rounded-full",
        className,
      )}
    />
  );
}

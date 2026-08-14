"use client";

import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  count?: number;
  height?: string;
  width?: string;
  columns?: number;
  className?: string;
}

export function LoadingSkeleton({
  count = 4,
  height = "h-24",
  width,
  columns,
  className,
}: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={cn(
        "surface-2 overflow-hidden",
        height,
        width,
        className,
      )}
    >
      <div className="w-full h-full animate-shimmer" />
    </div>
  ));

  if (columns) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-${columns} gap-3`}>
        {items}
      </div>
    );
  }

  return <div className="space-y-2">{items}</div>;
}

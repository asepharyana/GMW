import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={cn("rounded-lg bg-muted animate-shimmer", className)}
      {...props}
    />
  );
}

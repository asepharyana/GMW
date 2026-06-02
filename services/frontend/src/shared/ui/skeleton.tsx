import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md bg-muted animate-shimmer", className)}
      {...props}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Skeleton — Loading state yang subtle & smooth
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

type SkeletonVariant = "rounded" | "circular" | "rectangular";

const variantClasses: Record<SkeletonVariant, string> = {
  rounded: "rounded-lg",
  circular: "rounded-full",
  rectangular: "rounded-none",
};

export function Skeleton({
  variant = "rounded",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: SkeletonVariant }) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={cn(
        "bg-[#f0f0f0]",
        "animate-shimmer",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

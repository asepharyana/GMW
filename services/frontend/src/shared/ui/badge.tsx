/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Badge — Pill untuk status, kategori, dan label micro-interaction
 * rounded-full (9999px), padding 4px 12px, font label-sm (12px, 500 weight)
 * ═══════════════════════════════════════════════════════════════════════════ */

import type * as React from "react";
import { cn } from "../lib/utils";

type BadgeVariant =
  | "default"     /* Primary soft — #e1f0fd bg, #0d4a7a text */
  | "primary"     /* Same as default, explicit alias */
  | "secondary"   /* #e7f1ff bg, #003d99 text */
  | "tertiary"    /* #eef0ff bg, #1a2466 text */
  | "destructive" /* #ffebee bg, #e4405f text */
  | "outline"     /* Border only, no fill */
  | "success"     /* #dcfce7 bg, green text */
  | "warning"     /* #fef3c7 bg, amber text */
  | "info";       /* #dbeafe bg, blue text */

const variants: Record<BadgeVariant, string> = {
  default: "bg-[#e1f0fd] text-[#0d4a7a] border-transparent",
  primary: "bg-[#e1f0fd] text-[#0d4a7a] border-transparent",
  secondary: "bg-[#e7f1ff] text-[#003d99] border-transparent",
  tertiary: "bg-[#eef0ff] text-[#1a2466] border-transparent",
  destructive: "bg-[#ffebee] text-[#e4405f] border-transparent",
  outline: "bg-transparent text-[#666666] border-[#e0e0e0]",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  info: "bg-[#dbeafe] text-[#1e40af] border-transparent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      role="status"
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1",
        "font-sans text-xs font-medium leading-4 tracking-[0.03em]",
        "transition-colors duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

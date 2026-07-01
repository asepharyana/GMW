/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Button — Friendly, percaya diri, responsif.
 * Primary: #23a1eb → #1a8fd9 → #0877c1
 * Secondary: transparan dengan 1px border, fill subtle di hover
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Slot } from "@radix-ui/react-slot";
import type * as React from "react";
import { cn } from "../lib/utils";

type ButtonVariant =
  | "default"    /* Primary IMPHNEN blue */
  | "secondary"  /* Outline with subtle fill */
  | "tertiary"   /* Discord-style blurple */
  | "destructive"/* Red semantic */
  | "outline"    /* Light border, no fill */
  | "ghost"      /* No border, fill on hover */
  | "link";      /* Text-only */
type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  default:
    "bg-[#23a1eb] text-white shadow-sm " +
    "hover:bg-[#1a8fd9] " +
    "active:bg-[#0877c1] " +
    "focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
  secondary:
    "bg-transparent text-[#23a1eb] border border-[#e0e0e0] " +
    "hover:bg-[#f0f0f0] hover:border-[#23a1eb] " +
    "active:bg-[#e1f0fd] " +
    "focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
  destructive:
    "bg-[#e4405f] text-white shadow-sm " +
    "hover:bg-[#d63856] " +
    "active:bg-[#c2304d] " +
    "focus-visible:ring-2 focus-visible:ring-[#e4405f]/40",
  outline:
    "bg-transparent text-[#1a1a1a] border border-[#e0e0e0] " +
    "hover:bg-[#f0f0f0] hover:text-[#23a1eb] " +
    "active:bg-[#e1f0fd] " +
    "focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
  ghost:
    "bg-transparent text-[#1a1a1a] " +
    "hover:bg-[#f0f0f0] hover:text-[#23a1eb] " +
    "active:bg-[#e1f0fd] " +
    "focus-visible:ring-2 focus-visible:ring-[#23a1eb]/40",
  link:
    "bg-transparent text-[#23a1eb] underline-offset-4 " +
    "hover:underline " +
    "active:text-[#0877c1]",
  tertiary:
    "bg-[#5865f2] text-white shadow-sm " +
    "hover:bg-[#5865f2]/90 " +
    "focus-visible:ring-2 focus-visible:ring-[#5865f2]/40",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-11 px-6 py-3",       /* 44px height, 24px horizontal */
  sm: "h-9 rounded-lg px-3 py-2",  /* 36px compact */
  lg: "h-12 rounded-lg px-8 py-3", /* 48px spacious */
  icon: "h-11 w-11",               /* Square 44x44 */
  'icon-sm': 'h-8 w-8',           /* Square 32x32 */
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap",
        "font-sans font-semibold text-sm leading-5 tracking-[0.02em]",
        "rounded-lg", /* 1rem / 16px — Friendly Geometry */
        "transition-all duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        "focus-visible:outline-none focus-visible:ring-offset-2",
        "active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={!asChild ? disabled : undefined}
      {...props}
    />
  );
}

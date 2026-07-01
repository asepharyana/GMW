/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Input — Clean, approachable, dengan focus glow signature
 * rounded DEFAULT (0.5rem), bg #f0f0f0, border #e0e0e0
 * Focus: border #23a1eb + 3px glow
 * ═══════════════════════════════════════════════════════════════════════════ */

import type * as React from "react";
import { cn } from "../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  errorId?: string;
}

type InputVariant = 'default' | 'soft';

const variantClasses: Record<InputVariant, string> = {
  default: 'border border-[#e0e0e0] bg-white',
  soft: 'border-transparent bg-[#f5f5f5] focus-visible:border-[#23a1eb]',
};

export function Input({ className, type, errorId, variant = 'default', ...props }: InputProps & { variant?: InputVariant }) {
  return (
    <input
      type={type}
      aria-describedby={errorId}
      className={cn(
        /* Layout & sizing */
        "flex h-10 w-full rounded-lg px-3 py-2",
        /* Typography — Poppins body-md */
        "font-sans text-sm text-[#1a1a1a]",
        /* Visual — IMPHNEN input surface */
        variantClasses[variant],
        /* Placeholder */
        "placeholder:text-[#999999]",
        /* File input overrides */
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        /* Focus — signature IMPHNEN glow */
        "focus-visible:outline-none",
        "focus-visible:border-[#23a1eb]",
        "focus-visible:shadow-[0_0_0_3px_rgba(35,161,235,0.1)]",
        /* Disabled */
        "disabled:cursor-not-allowed disabled:opacity-50",
        /* Error state */
        props["aria-invalid"] === "true" &&
          "border-[#e4405f] shadow-[0_0_0_3px_rgba(228,64,95,0.1)]",
        className,
      )}
      {...props}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Select — Native select dengan styling IMPHNEN
 * ═══════════════════════════════════════════════════════════════════════════ */

import type * as React from "react";
import { cn } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  className,
  options,
  placeholder,
  ...props
}: SelectProps) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-lg px-3 py-2",
        "font-sans text-sm text-[#1a1a1a]",
        "bg-[#f5f5f5] border border-[#e0e0e0]",
        "focus-visible:outline-none",
        "focus-visible:border-[#23a1eb]",
        "focus-visible:shadow-[0_0_0_3px_rgba(35,161,235,0.1)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        props["aria-invalid"] === "true" &&
          "border-[#e4405f] shadow-[0_0_0_3px_rgba(228,64,95,0.1)]",
        className,
      )}
      {...props}
    >
      {placeholder && (
        <option value="" disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

"use client";

import * as React from "react";

/**
 * Minimal Slot — merges its props onto its single child element (Radix-style
 * `asChild`). Enough for wrapping <Link>/<a> in a Button.
 */
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, ...slotProps }, ref) => {
    if (!React.isValidElement(children)) return null;
    const childProps = children.props as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...childProps, ...slotProps, ref };
    // Merge className
    if (slotProps.className || childProps.className) {
      merged.className = [childProps.className, slotProps.className]
        .filter(Boolean)
        .join(" ");
    }
    // Merge style
    if (slotProps.style || childProps.style) {
      merged.style = { ...(childProps.style as object), ...(slotProps.style as object) };
    }
    return React.cloneElement(children, merged);
  },
);
Slot.displayName = "Slot";

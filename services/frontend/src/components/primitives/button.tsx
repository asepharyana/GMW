"use client";

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-[var(--color-signal)] text-[var(--color-signal-ink)] hover:opacity-90",
  ghost:
    "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]",
  danger: "bg-[var(--color-vermilion)] text-white hover:opacity-90",
  outline:
    "bg-transparent text-[var(--color-ink)] border border-[var(--color-hairline)] hover:bg-[var(--color-surface-2)]",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-r-control)]",
  md: "h-10 px-4 text-sm rounded-[var(--radius-r-control)]",
  lg: "h-12 px-6 text-base rounded-[var(--radius-r)]",
  icon: "size-9 rounded-[var(--radius-r-control)]",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", children, ...props },
    ref,
  ) => {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 select-none cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150",
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);
Button.displayName = "Button";

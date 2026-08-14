import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-[var(--color-surface-2)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)]/60",
        "rounded-[var(--radius-r-control)] border border-[var(--color-hairline)] px-3 py-2 text-sm",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] transition-colors",
        mono && "font-mono tracking-tight",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

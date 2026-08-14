import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  mono?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, mono, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full bg-[var(--color-surface-2)] text-[var(--color-ink)] appearance-none cursor-pointer",
        "rounded-[var(--radius-r-control)] border border-[var(--color-hairline)] px-3 py-2 text-sm",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] transition-colors",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%23aaa%22 stroke-width=%222%22><path d=%22M2 4l4 4 4-4%22/></svg>')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        mono && "font-mono tracking-tight",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

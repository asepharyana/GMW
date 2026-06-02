import type * as React from "react";
import { cn } from "../lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-muted text-muted-foreground",
  destructive: "border-transparent bg-[#FCA5A5] text-red-800",
  outline: "border-border text-foreground",
  success: "border-transparent bg-[#BBF7D0] text-green-800",
  warning: "border-transparent bg-[#FDE68A] text-amber-800",
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
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

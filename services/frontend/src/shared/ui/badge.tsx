import type * as React from "react";
import { cn } from "../lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info";

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-muted text-muted-foreground",
  destructive: "border-transparent bg-destructive/15 text-destructive",
  outline: "border-border text-foreground",
  success:
    "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
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
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

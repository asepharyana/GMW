import type * as React from "react";
import { cn } from "../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  errorId?: string;
}

export function Input({ className, type, errorId, ...props }: InputProps) {
  return (
    <input
      type={type}
      aria-describedby={errorId}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        props["aria-invalid"] === "true" &&
          "border-destructive ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

import { Slot } from "@radix-ui/react-slot";
import type * as React from "react";
import { cn } from "../lib/utils";

type ButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-lg px-3",
  lg: "h-11 rounded-lg px-8",
  icon: "h-10 w-10",
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
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

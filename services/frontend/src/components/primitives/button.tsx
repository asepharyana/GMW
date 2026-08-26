import type React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = ({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: "primary" | "ghost" | "danger" | "secondary" | "subtle" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
}) => {
  const base =
    "inline-flex items-center justify-center font-sans font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

  const variants = {
    primary:
      "bg-signal text-white hover:opacity-90 shadow-xs active:scale-[0.98]",
    ghost:
      "bg-surface-2 text-ink-soft border border-hairline hover:bg-surface hover:text-ink hover:border-hairline-focus active:scale-[0.98]",
    outline:
      "bg-transparent text-ink-soft border border-hairline hover:bg-surface-2 hover:text-ink active:scale-[0.98]",
    secondary:
      "bg-surface text-ink hover:bg-surface-2 border border-hairline active:scale-[0.98]",
    subtle: "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
    danger:
      "bg-vermilion/15 text-vermilion border border-vermilion/30 hover:bg-vermilion/25 active:scale-[0.98]",
  };

  const sizes = {
    sm: "h-7 px-2.5 text-xs rounded-[8px] gap-1.5",
    md: "h-8.5 px-3.5 text-xs rounded-[8px] gap-2",
    lg: "h-10 px-4 text-sm rounded-[8px] gap-2.5",
    icon: "size-8.5 rounded-[8px] p-0",
  };

  return cn(base, variants[variant], sizes[size], className);
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "secondary" | "subtle" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = ({
  className,
  variant = "ghost",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
};

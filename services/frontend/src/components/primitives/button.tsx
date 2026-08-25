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
    "inline-flex items-center justify-center font-sans font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7170ff] disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

  const variants = {
    primary:
      "bg-[#5e6ad2] text-white hover:bg-[#7170ff] shadow-sm active:scale-[0.98]",
    ghost:
      "bg-white/[0.03] text-[#d0d6e0] border border-white/[0.08] hover:bg-white/[0.06] hover:text-[#f7f8f8] hover:border-white/[0.14] active:scale-[0.98]",
    outline:
      "bg-transparent text-[#d0d6e0] border border-white/[0.12] hover:bg-white/[0.04] hover:text-[#f7f8f8] active:scale-[0.98]",
    secondary:
      "bg-white/[0.06] text-[#f7f8f8] hover:bg-white/[0.1] border border-white/[0.08] active:scale-[0.98]",
    subtle:
      "bg-transparent text-[#8a8f98] hover:bg-white/[0.04] hover:text-[#f7f8f8]",
    danger:
      "bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 hover:bg-[#f43f5e]/25 active:scale-[0.98]",
  };

  const sizes = {
    sm: "h-7 px-2.5 text-xs rounded-[5px] gap-1.5",
    md: "h-8.5 px-3.5 text-xs rounded-[6px] gap-2",
    lg: "h-10 px-4 text-sm rounded-[7px] gap-2.5",
    icon: "size-8.5 rounded-[6px] p-0",
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

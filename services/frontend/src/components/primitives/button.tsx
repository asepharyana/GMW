import { Slot } from "./slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-signal text-signal-ink hover:brightness-110 shadow-[0_8px_24px_-10px_var(--color-signal-glow)] font-semibold",
  ghost: "text-ink-soft hover:text-ink hover:bg-white/5",
  outline:
    "border border-hairline bg-white/0 text-ink hover:bg-white/5 hover:border-signal/40",
  danger:
    "bg-vermilion text-white hover:brightness-110 shadow-[0_8px_24px_-10px_var(--color-vermilion-glow)] font-semibold",
  subtle: "bg-white/5 text-ink hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[9px] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[11px] gap-2",
  lg: "h-12 px-6 text-base rounded-[13px] gap-2",
  icon: "h-10 w-10 rounded-[11px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = ({
  className,
  variant = "subtle",
  size = "md",
  asChild,
  ...props
}: ButtonProps) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
};

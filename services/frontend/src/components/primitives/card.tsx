import { cn } from "@/lib/utils";

/** Floating glass panel — primary container. */
export function GlassPanel({
  className,
  children,
  glow,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        "glass p-5",
        glow && "shadow-[0_0_40px_-18px_var(--color-signal-glow)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Smaller glass sub-panel. */
export function GlassCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-2 p-4", className)} {...props}>
      {children}
    </div>
  );
}

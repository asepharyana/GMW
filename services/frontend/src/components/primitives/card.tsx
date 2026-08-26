import { cn } from "@/lib/utils";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function GlassPanel({
  children,
  className,
  style,
  glow,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "relative rounded-[10px] border border-hairline bg-surface p-5 shadow-xl backdrop-blur-md transition-all duration-200",
        glow && "shadow-[0_0_24px_var(--color-signal-glow)] border-signal/30",
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassCard({
  children,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-[8px] border border-hairline bg-surface-2 p-4 transition-all duration-200 hover:border-hairline-focus hover:bg-surface",
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}

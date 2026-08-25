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
        "relative rounded-[10px] border border-white/[0.08] bg-[#0f1011]/80 p-5 shadow-xl backdrop-blur-md transition-all duration-200",
        glow && "shadow-[0_0_24px_rgba(113,112,255,0.12)] border-[#7170ff]/30",
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
        "relative rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]",
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}

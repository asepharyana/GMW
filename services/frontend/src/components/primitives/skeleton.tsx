import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] bg-white/[0.06] animate-shimmer relative overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

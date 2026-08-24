import { cn } from "@/lib/utils";

/**
 * Wraps a view's root so the whole panel stack rises + settles on mount.
 * The animation is disabled under prefers-reduced-motion via globals.css.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("animate-fade-up", className)}>{children}</div>;
}

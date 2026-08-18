import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns an inline style that staggers a list item's entrance animation.
 * Pair with the `animate-stagger` class. Caps the delay so long lists still
 * appear promptly.
 */
export function staggerDelay(
  index: number,
  step = 45,
  max = 600,
): React.CSSProperties {
  return { animationDelay: `${Math.min(index * step, max)}ms` };
}

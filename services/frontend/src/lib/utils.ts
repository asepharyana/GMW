import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Inline `animationDelay` for staggered list reveals. Pair with the
 * `animate-stagger` class on the item root. steps=45ms, capped at 600ms so
 * long lists don't drag the reveal out. */
export function staggerDelay(i: number, step = 45, max = 600) {
  return { animationDelay: `${Math.min(i * step, max)}ms` };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Card — Primary content container
 * rounded-xl (1.5rem), border subtle, shadow-sm default → shadow-md hover
 * ═══════════════════════════════════════════════════════════════════════════ */

import type * as React from "react";
import { cn } from "../lib/utils";

type CardVariant = 'default' | 'elevated' | 'bordered';

const variantClasses: Record<CardVariant, string> = {
  default: 'shadow-sm hover:shadow-md',
  elevated: 'shadow-md hover:shadow-lg',
  bordered: 'shadow-none border-2',
};

export function Card({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return (
    <div
      role="region"
      className={cn(
        "rounded-xl border border-[#e0e0e0] bg-white text-[#1a1a1a]",
        "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        "hover:border-[#23a1eb]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-sans font-semibold text-lg leading-none tracking-tight text-[#1a1a1a]",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-sans text-sm text-[#666666]", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
  );
}

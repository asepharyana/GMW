import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  variant?: "default" | "danger" | "success" | "warning";
}

const variantStyles = {
  default: "from-cyan-500/10 to-teal-500/5 border-cyan-500/20",
  danger: "from-red-500/10 to-rose-500/5 border-red-500/20",
  success: "from-emerald-500/10 to-green-500/5 border-emerald-500/20",
  warning: "from-amber-500/10 to-yellow-500/5 border-amber-500/20",
};

const iconBg = {
  default: "bg-cyan-500/15 text-cyan-400",
  danger: "bg-red-500/15 text-red-400",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
};

const valueColor = {
  default: "",
  danger: "text-red-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
};

/**
 * Metric card used across dashboard and landing pages.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "border bg-gradient-to-br backdrop-blur-sm",
        variantStyles[variant],
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground/80 tracking-wide">
              {label}
            </p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums tracking-tight",
                valueColor[variant],
              )}
            >
              {formatNumber(value)}
            </p>
          </div>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              iconBg[variant],
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

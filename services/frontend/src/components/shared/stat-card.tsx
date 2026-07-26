import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  variant?: "default" | "danger" | "success";
}

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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums tracking-tight",
                variant === "danger" && "text-destructive",
                variant === "success" && "text-green-500",
              )}
            >
              {formatNumber(value)}
            </p>
          </div>
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              variant === "danger"
                ? "bg-destructive/10 text-destructive"
                : variant === "success"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

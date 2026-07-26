import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DetailStatProps {
  label: string;
  value: number;
  variant?: "default" | "danger" | "success";
  suffix?: string;
}

/**
 * Small stat label used inside detail views.
 */
export function DetailStat({
  label,
  value,
  variant = "default",
  suffix,
}: DetailStatProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-lg font-bold tabular-nums",
            variant === "danger" && "text-destructive",
            variant === "success" && "text-green-500",
          )}
        >
          {formatNumber(value)}
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}

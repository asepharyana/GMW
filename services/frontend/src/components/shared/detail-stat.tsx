import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DetailStatProps {
  label: string;
  value: number;
  variant?: "default" | "danger" | "success";
  suffix?: string;
}

const valueColor = {
  default: "",
  danger: "text-red-400",
  success: "text-emerald-400",
};

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
    <Card className="bg-gradient-to-br from-cyan-500/5 to-transparent border-cyan-500/10">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground/70 tracking-wide">
          {label}
        </p>
        <p
          className={cn("text-lg font-bold tabular-nums", valueColor[variant])}
        >
          {formatNumber(value)}
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}

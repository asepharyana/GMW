import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/primitives/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="size-10 text-[var(--color-vermilion)] mb-3" />
      <p className="text-sm text-[var(--color-ink-soft)] mb-4 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

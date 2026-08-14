import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className={cn("surface flex flex-col items-center gap-2 py-8")}>
            <AlertCircle className="size-6 text-[var(--color-vermilion)]" />
            <p className="text-sm text-[var(--color-ink)]">
              {this.state.error?.message || "Something went wrong"}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="flex items-center gap-1 text-xs text-[var(--color-signal)] hover:opacity-80 transition-colors"
            >
              <RefreshCw className="size-3" /> Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

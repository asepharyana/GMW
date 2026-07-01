import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  className?: string;
  message?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component — catches JavaScript errors in its child tree,
 * logs them, and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error.message, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center",
            this.props.className,
          )}
          role="alert"
        >
          <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
          <h3 className="mb-1 font-semibold text-foreground">
            {this.props.message || "Something went wrong"}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            onClick={this.handleRetry}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

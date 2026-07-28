"use client";

import { Component, type ReactNode } from "react";
import { GlassCard } from "@/components/glass/card";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <GlassCard variant="danger" className="flex flex-col items-center gap-2 py-8">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm text-text-secondary">{this.state.error?.message || "Something went wrong"}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <RefreshCw className="size-3" /> Try again
          </button>
        </GlassCard>
      );
    }
    return this.props.children;
  }
}

"use client";

import { Component, type ReactNode } from "react";
import { ErrorState } from "./states";

/**
 * React error boundary — catches render/exception crashes in child trees
 * (e.g. third-party lib throwing on unexpected payload shape) and surfaces
 * a consistent ErrorState instead of unmounting the whole app shell.
 *
 * Usage: wrap leaf views in <ErrorBoundary><SomeView /></ErrorBoundary>.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <ErrorState
        title="Something went wrong"
        error={this.state.error}
        onRetry={this.reset}
      />
    );
  }
}

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
};

type State = {
  hasError: boolean;
};

/** Isolates client render failures so one section cannot white-screen the dashboard. */
export class DashboardSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      "[dashboard-ssr-fail-open]",
      this.props.context ?? "dashboard-section",
      error,
      info.componentStack
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            This section is temporarily unavailable.
          </div>
        )
      );
    }

    return this.props.children;
  }
}

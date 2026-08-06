import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props!: ErrorBoundaryProps;
  state: ErrorBoundaryState = { hasError: false, error: null };
  setState!: (patch: Partial<ErrorBoundaryState>, callback?: () => void) => void;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const s = this.state;
    const p = this.props;
    if (s.hasError) {
      if (p.fallback) return p.fallback;

      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface-elevated rounded-xl border border-border-subtle shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-error/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-error" />
            </div>
            <h2 className="text-h3 font-bold text-text-primary mb-2">Something went wrong</h2>
            <p className="text-sm text-text-muted mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {s.error && (
              <div className="bg-error-light border border-error/20 rounded-lg p-3 mb-4 text-left">
                <p className="text-xs text-error-dark font-mono break-all">{s.error.message}</p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-light transition mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return p.children;
  }
}

export default function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorBoundaryClass {...props} />;
}

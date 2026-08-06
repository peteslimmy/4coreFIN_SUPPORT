import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class PageErrorBoundaryClass extends React.Component<Props, State> {
  props!: Props;
  state: State = { hasError: false, error: null };
  setState!: (patch: Partial<State>, callback?: () => void) => void;

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.pageName || 'Page'}] Error:`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const s = this.state;
    const p = this.props;
    if (s.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-error/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-error" />
            </div>
            <h3 className="text-h3 font-bold text-text-primary mb-1">{p.pageName || 'Page'} Error</h3>
            <p className="text-sm text-text-muted mb-4">Something went wrong loading this page.</p>
            <details className="text-left text-xs text-text-muted bg-surface rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
              <summary className="cursor-pointer font-semibold">Error details</summary>
              <p className="mt-2 font-mono">{s.error?.message}</p>
            </details>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-light transition"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      );
    }
    return p.children;
  }
}

export default function PageErrorBoundary(props: Props) {
  return <PageErrorBoundaryClass {...props} />;
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStore } from '../store/store';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    try {
      useStore.getState().addToast({
        type: 'error',
        title: 'Module Error',
        message: error.message
      });
    } catch {
      // Ignore if store isn't ready
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center bg-black/50 border border-red-500/20 rounded-xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <ShieldAlert className="text-red-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Plugin Crashed</h2>
          <p className="text-gray-400 max-w-md mb-4 text-sm">
            An unexpected error occurred in this module. The rest of CodexOS is still running normally.
          </p>
          <div className="text-left bg-black p-4 rounded border border-white/5 overflow-x-auto w-full max-w-2xl">
            <pre className="text-xs text-red-300 font-mono">
              {this.state.error?.toString()}
            </pre>
          </div>
          <button
            className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try to Reload Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

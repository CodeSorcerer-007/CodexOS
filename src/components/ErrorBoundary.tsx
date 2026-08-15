import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ShieldAlert, Copy, Check, RefreshCw } from 'lucide-react';
import { useStore } from '../store/store';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught module error:', error, errorInfo);
    try {
      useStore.getState().addToast({
        type: 'error',
        title: 'Module Error',
        message: error.message,
      });
    } catch {
      // Ignore if store isn't ready
    }
  }

  private handleCopy = () => {
    if (this.state.error) {
      const details = `[CodexOS Error Diagnostic]\nMessage: ${this.state.error.message}\nStack:\n${this.state.error.stack || 'No stack trace'}\nTimestamp: ${new Date().toISOString()}`;
      navigator.clipboard.writeText(details).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      });
    }
  };

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
            An unexpected error occurred in this module. The rest of CodexOS is running securely.
          </p>
          <div className="text-left bg-black/80 p-4 rounded-lg border border-white/10 overflow-x-auto w-full max-w-2xl">
            <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
              onClick={this.handleCopy}
            >
              {this.state.copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              {this.state.copied ? 'Copied' : 'Copy Error Details'}
            </button>
            <button
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm shadow-[0_0_12px_rgba(99,102,241,0.4)]"
              onClick={() => this.setState({ hasError: false, error: null, copied: false })}
            >
              <RefreshCw size={16} />
              Try to Reload Module
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

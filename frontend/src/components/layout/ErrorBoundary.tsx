import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh bg-panel-bg text-gray-900 p-4 max-w-2xl mx-auto flex flex-col items-center justify-center text-center">
          <div className="bg-panel-surface border border-panel-border rounded-xl p-6 w-full">
            <div className="text-xs text-gray-800 uppercase tracking-widest mb-2">
              Something went wrong
            </div>
            <p className="text-sm text-red-500 mb-4">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg px-4 py-2 text-sm border border-panel-border text-gray-600 hover:border-gray-500 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

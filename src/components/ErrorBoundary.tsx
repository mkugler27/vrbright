import { Component, type ReactNode } from 'react';

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

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-5">
          <h2 className="text-lg font-bold text-red-600 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-700 mb-1">{this.state.error.message}</p>
          <pre className="text-[10px] text-gray-500 bg-gray-50 p-2 rounded overflow-auto max-h-40">
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 text-xs text-primary-dark font-semibold"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

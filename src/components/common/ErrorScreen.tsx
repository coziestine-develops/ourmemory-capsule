import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Memory Capsule render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="max-w-lg rounded-3xl bg-white p-8 shadow-polaroid">
          <h1 className="font-heading text-2xl font-semibold">Something went wrong on this page.</h1>
          <p className="mt-2 text-sm text-mocha">Refresh the page. If it keeps happening, check the browser console (F12) for details.</p>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-ivory p-4 text-xs">{this.state.error.message}</pre>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Card } from "../ui";

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
        <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center bg-page p-4 text-center text-ink">
          <Card title="Something went wrong" className="w-full">
            <p className="text-body text-danger-text">
              {this.state.error.message}
            </p>
            <Button onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

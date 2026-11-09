import { Component, type ErrorInfo, type ReactNode } from "react";
import { PortalErrorState } from "./PortalErrorState";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Keeps an unexpected render failure inside the portal instead of a blank page. */
export class PortalErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Portal render failure", error, info.componentStack);
    }
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <main className="min-h-screen bg-mist px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <PortalErrorState
              title="This page ran into a problem"
              message="Your saved information is safe. Try loading the page again, or return later if the problem continues."
              onRetry={this.retry}
            />
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

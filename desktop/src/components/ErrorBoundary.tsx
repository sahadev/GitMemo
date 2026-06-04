import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gm-error-shell">
          <div className="gm-error-panel">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--gm-space-5)" }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: "999px",
                background: "var(--red)",
                boxShadow: "var(--gm-shadow-danger-ring)",
                flexShrink: 0,
              }} />
              <h2 style={{ color: "var(--text)", fontSize: "var(--gm-font-lg)", margin: 0 }}>Something went wrong</h2>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--gm-font-xs)", lineHeight: 1.6, marginTop: "var(--gm-space-5)" }}>
              GitMemo hit a render error. You can retry the current view below.
            </p>
            <pre className="gm-error-log">
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
            <button
              className="gm-toolbar-button"
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ marginTop: "var(--gm-space-8)", padding: "var(--gm-space-3) var(--gm-space-7)", color: "var(--text)" }}
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

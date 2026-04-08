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
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          color: "var(--text)",
          background: "var(--bg)",
        }}>
          <h2 style={{ marginBottom: 12, color: "var(--red)" }}>Something went wrong</h2>
          <pre style={{
            background: "var(--bg-card)",
            padding: 16,
            borderRadius: 6,
            maxWidth: "80vw",
            overflow: "auto",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-hover)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 局部模式：只占该区域，不接管整页；标题里带上出问题的区域名。 */
  compact?: boolean;
  scope?: string;
  /** 变化时自动清掉错误（例如切页、切 tab 后重试）。 */
  resetKey?: unknown;
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

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.props.compact) {
      // 局部降级：这一块报错就把这一块换成提示，页面其余部分照常可用。
      return (
        <div className="gm-empty-state gm-error-inline" role="alert">
          <p className="gm-empty-state-title">
            {this.props.scope ? `${this.props.scope} 没能加载` : "This section could not load"}
          </p>
          <p className="gm-empty-state-description">
            {this.state.error?.message}
          </p>
          <button
            className="gm-toolbar-button gm-error-action"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="gm-error-shell">
          <div className="gm-error-panel">
            <div className="gm-error-head">
              <div className="gm-error-dot" />
              <h2 className="gm-error-title">Something went wrong</h2>
            </div>
            <p className="gm-error-copy">
              GitMemo hit a render error. You can retry the current view below.
            </p>
            <pre className="gm-error-log">
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
            <button
              className="gm-toolbar-button gm-error-action"
              onClick={() => this.setState({ hasError: false, error: null })}
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

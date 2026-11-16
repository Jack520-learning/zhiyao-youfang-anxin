import { Component, type ErrorInfo, type ReactNode } from "react";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface RouteErrorBoundaryState {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route rendering failed", error, info.componentStack);
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <section className="card card-pad route-error" role="alert">
          <p className="eyebrow">页面载入异常</p>
          <h1 className="page-title">这个页面没有正常显示</h1>
          <p className="page-description">
            当前页面遇到临时错误，您的用药档案不会受到影响。可以重新载入，或先返回首页。
          </p>
          <div className="header-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              重新载入
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => window.location.assign("/")}
            >
              返回首页
            </button>
          </div>
        </section>
      </div>
    );
  }
}

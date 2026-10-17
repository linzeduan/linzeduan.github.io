import { StrictMode, Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { LocalRoot } from "./features/local/LocalRoot";
import "./styles/index.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty-state">
        <h1>这一页暂时没能打开</h1>
        <p>页面遇到了一点问题。刷新会重新载入演示示例。</p>
        <button className="button" onClick={() => location.reload()}>
          重新打开
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {import.meta.env.VITE_APP_MODE === "local" ? <LocalRoot /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);

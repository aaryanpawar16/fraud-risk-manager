// src/components/layout/ErrorBoundary.tsx
import { Component, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, wire this to your logging endpoint instead of console.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
            background: "var(--bg-base)",
          }}
        >
          <AlertOctagon size={28} color="var(--signal-high)" aria-hidden />
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Something went wrong on this page
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 380, margin: 0 }}>
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/app";
            }}
            style={{
              marginTop: 8,
              background: "var(--accent)",
              color: "#0b1220",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Return to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

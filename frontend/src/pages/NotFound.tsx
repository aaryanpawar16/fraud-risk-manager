// src/pages/NotFound.tsx
import { Link } from "react-router-dom";
import { CompassIcon } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        height: "100%",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <CompassIcon size={28} color="var(--text-muted)" aria-hidden />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>404</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, margin: 0 }}>
        This page doesn't exist
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 320, margin: 0 }}>
        The route you followed isn't part of the console. Head back to the dashboard.
      </p>
      <Link
        to="/app"
        style={{
          marginTop: 8,
          background: "var(--accent)",
          color: "#0b1220",
          borderRadius: "var(--radius-sm)",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}

// src/components/layout/PageHeader.tsx
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}

/** Consistent header for every console page: small mono eyebrow, display
 * title, optional right-aligned action (a status pill, a filter control,
 * etc.), and a soft bottom divider that gives the header a bit of
 * separation from the page body instead of copy sitting directly on the
 * background. Used in place of each page's own hand-rolled header block. */
export default function PageHeader({ title, eyebrow = "Fraud Risk Manager", action }: PageHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 28,
        paddingBottom: 20,
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            margin: "4px 0 0",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}

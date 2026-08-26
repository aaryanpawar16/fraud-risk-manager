// src/components/ui/atoms.tsx
import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Inbox } from "lucide-react";
import type { RiskBand } from "@/api/types";
// bandFromScore is defined once in lib/utils.ts (the single source of
// truth for threshold boundaries) and re-exported here so existing page
// imports from "@/components/ui/atoms" keep working.
export { bandFromScore } from "@/lib/utils";

const RISK_STYLES: Record<RiskBand, { color: string; bg: string; label: string }> = {
  low: { color: "var(--signal-low)", bg: "var(--signal-low-bg)", label: "Low risk" },
  medium: { color: "var(--signal-medium)", bg: "var(--signal-medium-bg)", label: "Medium risk" },
  high: { color: "var(--signal-high)", bg: "var(--signal-high-bg)", label: "High risk" },
};

/** The signature element: a thin vertical signal bar + dot, used on every
 * card and row that carries a risk state. Consistent across all pages. */
export function RiskBadge({ band, size = "md" }: { band: RiskBand; size?: "sm" | "md" }) {
  const s = RISK_STYLES[band];
  const pad = size === "sm" ? "2px 8px" : "4px 10px";
  const font = size === "sm" ? "11px" : "12px";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: pad,
        borderRadius: "var(--radius-sm)",
        background: s.bg,
        color: s.color,
        fontFamily: "var(--font-mono)",
        fontSize: font,
        fontWeight: 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: s.color,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

export function SignalStrip({ band }: { band: RiskBand }) {
  const s = RISK_STYLES[band];
  return (
    <div
      style={{ width: 3, alignSelf: "stretch", background: s.color, borderRadius: 2, flexShrink: 0 }}
      aria-hidden
    />
  );
}

export function Panel({
  children,
  title,
  eyebrow,
  action,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={className}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        padding: 20,
      }}
    >
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            {eyebrow && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                {title}
              </h3>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        padding: "32px 0",
        justifyContent: "center",
      }}
    >
      <Loader2 size={16} className="spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "32px 16px",
        textAlign: "center",
      }}
    >
      <AlertTriangle size={20} color="var(--signal-high)" aria-hidden />
      <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0, maxWidth: 360 }}>
        Couldn't load this. {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "40px 16px",
        color: "var(--text-muted)",
      }}
    >
      <Inbox size={20} aria-hidden />
      <p style={{ fontSize: 13, margin: 0 }}>{label}</p>
    </div>
  );
}

export function StatValue({ value, unit, tone = "primary" }: { value: string; unit?: string; tone?: "primary" | "accent" }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 28,
        fontWeight: 600,
        color: tone === "accent" ? "var(--accent)" : "var(--text-primary)",
      }}
    >
      {value}
      {unit && <span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>{unit}</span>}
    </span>
  );
}

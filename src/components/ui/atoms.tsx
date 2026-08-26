// src/components/ui/atoms.tsx
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { CircularProgress } from "@/components/ui/circular-progress";
import type { RiskBand } from "@/api/types";
import { CardSpotlight } from "@/components/ui/card-spotlight";
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
 * card and row that carries a risk state. Consistent across all pages.
 * Carries a soft matching glow rather than a flat fill, so risk state
 * reads with a bit of depth instead of a plain colored chip. */
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
        boxShadow: `inset 0 0 0 1px ${s.color}33`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: s.color,
          boxShadow: `0 0 6px ${s.color}`,
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
      style={{
        width: 3,
        alignSelf: "stretch",
        background: s.color,
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: `0 0 8px ${s.color}66`,
      }}
      aria-hidden
    />
  );
}

/** Card container used throughout the console — every panel on every
 * page (Dashboard, Score order, Review queue, Abuse rings, Fraud spikes,
 * Batch scoring, Evidence) goes through this one component, so wrapping
 * it in CardSpotlight applies the mouse-tracking spotlight + WebGL dot
 * reveal everywhere at once rather than needing to touch each page. */
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
    <CardSpotlight
      className={`p-5 ${className}`}
      style={{
        boxShadow:
          "0 2px 4px rgba(0,0,0,0.3), 0 14px 32px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.025), inset 0 1px 0 rgba(255,255,255,0.045)",
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
    </CardSpotlight>
  );
}

/** Shared wrapper for the three feedback states below — a softly glowing
 * icon badge above the message, instead of a bare icon, so loading/error/
 * empty states feel considered rather than like a placeholder. */
function StateIconBadge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${color}14`,
        boxShadow: `0 0 0 1px ${color}2a, 0 0 20px -4px ${color}55`,
      }}
    >
      {children}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        padding: "36px 0",
        justifyContent: "center",
      }}
    >
      <StateIconBadge color="var(--accent)">
        <CircularProgress size={18} strokeWidth={2} />
      </StateIconBadge>
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
        gap: 12,
        padding: "36px 16px",
        textAlign: "center",
      }}
    >
      <StateIconBadge color="var(--signal-high)">
        <AlertTriangle size={18} color="var(--signal-high)" aria-hidden />
      </StateIconBadge>
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
            transition: "background 0.15s ease, transform 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
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
        gap: 12,
        padding: "44px 16px",
        color: "var(--text-muted)",
      }}
    >
      <StateIconBadge color="var(--text-muted)">
        <Inbox size={18} color="var(--text-secondary)" aria-hidden />
      </StateIconBadge>
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
        textShadow: tone === "accent" ? "0 0 20px rgba(91,141,239,0.35)" : "none",
      }}
    >
      {value}
      {unit && <span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>{unit}</span>}
    </span>
  );
}

/** Big-number-plus-comparison stat, e.g. "0.7668  ↓1.4pts vs baseline".
 * `tone` is set by the caller based on what the number actually means in
 * context, not auto-inferred from the sign of the delta — a negative
 * delta isn't always bad (baseline beating our production model isn't
 * an error, just an honestly-reported fact), so it gets "neutral"
 * amber rather than alarm-red. Keeps the same risk-color semantics used
 * everywhere else in the app rather than introducing a new meaning for
 * red/green here. */

type DeltaTone = "positive" | "neutral" | "negative";
type DeltaDirection = "up" | "down" | "flat";

const DELTA_TONE_COLOR: Record<DeltaTone, string> = {
  positive: "var(--signal-low)",
  neutral: "var(--signal-medium)",
  negative: "var(--signal-high)",
};

export function StatWithDelta({
  value,
  unit,
  deltaText,
  deltaTone,
  deltaDirection,
}: {
  value: string;
  unit?: string;
  deltaText: string;
  deltaTone: DeltaTone;
  deltaDirection: DeltaDirection;
}) {
  const color = DELTA_TONE_COLOR[deltaTone];
  const DeltaIcon = deltaDirection === "up" ? ArrowUp : deltaDirection === "down" ? ArrowDown : Minus;

  return (
    <div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--text-muted)", marginLeft: 4 }}>{unit}</span>}
      </span>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginLeft: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color,
        }}
      >
        <DeltaIcon size={12} aria-hidden />
        {deltaText}
      </div>
    </div>
  );
}

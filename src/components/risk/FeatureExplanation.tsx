// src/components/risk/FeatureExplanation.tsx
import type { FeatureReason } from "@/api/types";

interface FeatureExplanationProps {
  reasons: FeatureReason[];
  emptyLabel?: string;
}

/** Renders the "top contributing factors" list from a SHAP explanation.
 * Bar width is a rough visual scale of contribution magnitude - not a
 * calibrated axis, just enough to show relative weight at a glance. */
export default function FeatureExplanation({
  reasons,
  emptyLabel = "No single factor stood out — this order looks broadly typical.",
}: FeatureExplanationProps) {
  if (reasons.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{emptyLabel}</p>;
  }

  return (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Top contributing factors
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reasons.map((reason) => (
          <ReasonBar key={reason.feature} label={reason.label} contribution={reason.contribution} />
        ))}
      </div>
    </>
  );
}

function ReasonBar({ label, contribution }: { label: string; contribution: number }) {
  const width = Math.min(100, Math.abs(contribution) * 140);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--signal-medium)" }}>
          +{contribution.toFixed(2)}
        </span>
      </div>
      <div style={{ height: 4, background: "var(--bg-hover)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: "var(--signal-medium)" }} />
      </div>
    </div>
  );
}

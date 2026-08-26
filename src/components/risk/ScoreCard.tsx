// src/components/risk/ScoreCard.tsx
import { CheckCircle2, Eye, Ban, RotateCcw } from "lucide-react";
import type { ScoreResult } from "@/api/types";
import { Panel, RiskBadge, bandFromScore } from "@/components/ui/atoms";
import FeatureExplanation from "@/components/risk/FeatureExplanation";

interface ScoreCardProps {
  result: ScoreResult;
  threshold: number;
}

type Decision = "approve" | "review" | "block";

const DECISION_COPY: Record<Decision, { label: string; bg: string; color: string }> = {
  approve: { label: "approved automatically", bg: "var(--signal-low-bg)", color: "var(--signal-low)" },
  review: { label: "sent to review", bg: "var(--signal-medium-bg)", color: "var(--signal-medium)" },
  block: { label: "blocked outright", bg: "var(--signal-high-bg)", color: "var(--signal-high)" },
};

/** The full risk-assessment result card: score, risk badge, the
 * approve/review/block decision, and the SHAP-style top reasons.
 *
 * The decision is two-layered, deliberately:
 *   1. The merchant's adjustable cost-optimal threshold (same slider used
 *      on the Dashboard's cost curve) is the actual gate: below it,
 *      auto-approve; at or above it, the order is flagged.
 *   2. Among flagged orders, the backend's fixed risk band (independent
 *      of the slider) decides how severely to flag it — "review" for
 *      medium-band orders, "block" for high-band ones.
 * Earlier this only had two states (approve/review) and never surfaced
 * "block" at all, so a 76.8%-risk, high-band order with the slider at
 * 0.50 would show "sent to review" — the same message as a barely-flagged
 * medium-risk order — even though the risk badge said "High risk" and the
 * backend had already computed recommended_action: "block" for it. */
export default function ScoreCard({ result, threshold }: ScoreCardProps) {
  const band = bandFromScore(result.risk_score);
  const flagged = result.risk_score >= threshold;
  const decision: Decision = !flagged ? "approve" : band === "high" ? "block" : "review";
  const copy = DECISION_COPY[decision];
  const returnBand = result.return_risk.risk_band;

  return (
    <Panel title="Risk assessment" action={<RiskBadge band={band} />}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        Chargeback risk
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600 }}>
          {(result.risk_score * 100).toFixed(1)}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>/ 100 risk score</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          background: copy.bg,
          marginBottom: 20,
        }}
      >
        {decision === "approve" && <CheckCircle2 size={16} color={copy.color} />}
        {decision === "review" && <Eye size={16} color={copy.color} />}
        {decision === "block" && <Ban size={16} color={copy.color} />}
        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
          At threshold {threshold.toFixed(2)}, this order would be <strong>{copy.label}</strong>.
        </span>
      </div>

      <FeatureExplanation reasons={result.top_reasons} />

      {/* Return risk comes from a genuinely separate model (see
          ml/train_return_model.py), trained on the `returned` label with
          its own leakage guards and its own empirically-derived risk
          bands — not the chargeback score reused as a proxy. Shown as a
          clearly distinct section so it reads as a second, independent
          opinion rather than a sub-detail of the chargeback score above. */}
      <div style={{ borderTop: "1px solid var(--border-hairline)", marginTop: 20, paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RotateCcw size={13} color="var(--text-muted)" />
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Return risk — separate model
            </span>
          </div>
          <RiskBadge band={returnBand} size="sm" />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 600 }}>
            {(result.return_risk.risk_score * 100).toFixed(1)}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>/ 100 likelihood of return</span>
        </div>
        <FeatureExplanation reasons={result.return_risk.top_reasons} emptyLabel="No single factor pushes return likelihood up for this order." />
      </div>
    </Panel>
  );
}

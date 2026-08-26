// src/components/charts/ConfusionMatrix.tsx
import type { ThresholdSweepPoint } from "@/api/types";

interface ConfusionMatrixProps {
  point: ThresholdSweepPoint;
}

interface Cell {
  label: string;
  value: number;
  tone: "good" | "bad";
  description: string;
}

/** 2x2 confusion matrix at the cost-optimal threshold — uses the exact
 * tp/fp/fn/tn counts already returned in the /metrics response, no
 * separate computation or backend endpoint needed. "Good"/"bad" tone is
 * about the outcome quality (correct vs. incorrect prediction), not
 * about whether the count is large or small — a big true-negative count
 * is a good thing, unlike a big false-positive count. */
export default function ConfusionMatrix({ point }: ConfusionMatrixProps) {
  const cells: Cell[] = [
    { label: "True positive", value: point.tp, tone: "good", description: "Correctly flagged fraud" },
    { label: "False positive", value: point.fp, tone: "bad", description: "Good order wrongly flagged" },
    { label: "False negative", value: point.fn, tone: "bad", description: "Missed fraud" },
    { label: "True negative", value: point.tn, tone: "good", description: "Correctly approved" },
  ];

  const total = point.tp + point.fp + point.fn + point.tn;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {cells.map((cell) => (
          <div
            key={cell.label}
            style={{
              padding: "14px 12px",
              borderRadius: "var(--radius-sm)",
              background: cell.tone === "good" ? "var(--signal-low-bg)" : "var(--signal-high-bg)",
              boxShadow: `inset 0 0 0 1px ${cell.tone === "good" ? "var(--signal-low)" : "var(--signal-high)"}33`,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 24,
                fontWeight: 600,
                color: cell.tone === "good" ? "var(--signal-low)" : "var(--signal-high)",
              }}
            >
              {cell.value.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontWeight: 500 }}>{cell.label}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{cell.description}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
        {total.toLocaleString("en-IN")} holdout orders at threshold {point.threshold.toFixed(2)} — never seen during training.
      </p>
    </div>
  );
}

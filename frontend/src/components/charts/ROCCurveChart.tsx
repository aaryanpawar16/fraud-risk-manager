// src/components/charts/ROCCurveChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ThresholdSweepPoint } from "@/api/types";

interface ROCCurveChartProps {
  sweep: ThresholdSweepPoint[];
  height?: number;
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

/** Standard ROC curve — True Positive Rate vs. False Positive Rate,
 * computed client-side from the same tp/fp/fn/tn counts already served
 * at each threshold in the sweep (no new backend endpoint needed). The
 * diagonal reference line is the "random guessing" baseline every real
 * ROC curve is implicitly compared against — a model with no real
 * signal would hug that line; ours should sit well above it. */
export default function ROCCurveChart({ sweep, height = 266 }: ROCCurveChartProps) {
  const points = sweep.map((t) => {
    const tpr = t.tp / (t.tp + t.fn); // recall / sensitivity
    const fpr = t.fp / (t.fp + t.tn); // 1 - specificity
    return { fpr: Math.round(fpr * 1000) / 1000, tpr: Math.round(tpr * 1000) / 1000, threshold: t.threshold };
  });

  // Anchor the curve at the two points a full sweep implies but a finite
  // set of sampled thresholds doesn't literally reach: threshold→0 means
  // everything is flagged (FPR=1, TPR=1); threshold→1 means nothing is
  // (FPR=0, TPR=0). Without these, the plotted curve visibly stops short
  // of the corners a real ROC curve spans.
  const data = [{ fpr: 0, tpr: 0, threshold: 1 }, ...points, { fpr: 1, tpr: 1, threshold: 0 }].sort(
    (a, b) => a.fpr - b.fpr
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 28 }}>
        <CartesianGrid stroke="var(--border-hairline)" />
        <XAxis
          dataKey="fpr"
          type="number"
          domain={[0, 1]}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          label={{ value: "False positive rate", position: "bottom", offset: 0, fill: "var(--text-muted)", fontSize: 11 }}
        />
        <YAxis
          dataKey="tpr"
          type="number"
          domain={[0, 1]}
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          label={{ value: "True positive rate", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [value.toFixed(3), name === "tpr" ? "TPR (recall)" : name]}
          labelFormatter={(v) => `FPR ${v}`}
        />
        {/* Random-classifier baseline — a real model's curve should sit
            well above this, not hug it. */}
        <ReferenceLine
          segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
          stroke="var(--text-muted)"
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
        <Line type="monotone" dataKey="tpr" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
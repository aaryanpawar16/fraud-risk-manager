// src/components/charts/CostCurveChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ThresholdSweepPoint } from "@/api/types";

interface CostCurveChartProps {
  sweep: ThresholdSweepPoint[];
  optimalThreshold: number;
  height?: number;
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

/** Line chart of expected ₹ cost across the threshold sweep, with the
 * cost-minimizing threshold marked. Used on the Dashboard, and reusable
 * anywhere a merchant needs to see the tradeoff visually rather than as
 * a table. */
export default function CostCurveChart({ sweep, optimalThreshold, height = 220 }: CostCurveChartProps) {
  const data = sweep.map((t) => ({ threshold: t.threshold, cost: t.expected_cost_inr }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid stroke="var(--border-hairline)" vertical={false} />
        <XAxis dataKey="threshold" stroke="var(--text-muted)" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
        <YAxis
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Expected cost"]}
          labelFormatter={(v) => `Threshold ${v}`}
        />
        <ReferenceLine
          x={optimalThreshold}
          stroke="var(--accent)"
          strokeDasharray="4 4"
          label={{ value: "optimal", fill: "var(--accent)", fontSize: 11, position: "top" }}
        />
        <Line type="monotone" dataKey="cost" stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

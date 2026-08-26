// src/components/charts/DriftChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DriftSlice } from "@/api/types";

interface DriftChartProps {
  slices: DriftSlice[];
  height?: number;
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

/** Precision/recall across chronological holdout slices. A downward trend
 * here is the visual signal that fraud tactics have shifted since the
 * model was last trained. */
export default function DriftChart({ slices, height = 220 }: DriftChartProps) {
  const data = slices.map((s, i) => ({
    slice: `Period ${i + 1}`,
    precision: Math.round(s.precision * 1000) / 10,
    recall: Math.round(s.recall * 1000) / 10,
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--border-hairline)" vertical={false} />
          <XAxis dataKey="slice" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="var(--text-muted)"
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="precision" stroke="var(--signal-medium)" strokeWidth={2} dot={{ r: 3 }} name="Precision %" />
          <Line type="monotone" dataKey="recall" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="Recall %" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
        <LegendDot color="var(--signal-medium)" label="Precision" />
        <LegendDot color="var(--accent)" label="Recall" />
      </div>
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

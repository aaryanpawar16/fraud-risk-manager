// src/components/charts/SpikeChart.tsx
import { ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { FraudRatePoint } from "@/api/types";

interface SpikeChartProps {
  points: FraudRatePoint[];
  height?: number;
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

/** Weekly chargeback rate as a line, with the trailing rolling mean shown
 * as a faint band and spike weeks marked as distinct dots. The band only
 * appears once there's enough trailing history to compute it (see
 * spike_detector.py's WINDOW_SIZE) — early weeks show as a plain line
 * with no baseline yet, which is honest: there's no real baseline for
 * the detector to have judged them against. */
export default function SpikeChart({ points, height = 260 }: SpikeChartProps) {
  const data = points.map((p) => ({
    period: p.period_start,
    rate: Math.round(p.chargeback_rate * 1000) / 10,
    band: p.rolling_mean !== null ? Math.round(p.rolling_mean * 1000) / 10 : null,
    spike: p.is_spike ? Math.round(p.chargeback_rate * 1000) / 10 : null,
    zScore: p.z_score,
    orderCount: p.order_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid stroke="var(--border-hairline)" vertical={false} />
        <XAxis
          dataKey="period"
          stroke="var(--text-muted)"
          tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
          tickFormatter={(v: string) =>
            new Date(v).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
          } // e.g. "Mar 25" — includes the year since the ~18-month span
          // means month/day alone (e.g. "03-03") repeats across years and
          // could be misread as a yearly cycle rather than a straight
          // chronological progression
          interval={Math.ceil(data.length / 10)}
        />
        <YAxis
          stroke="var(--text-muted)"
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => {
            if (name === "rate") return [`${value}%`, "Chargeback rate"];
            if (name === "band") return [`${value}%`, "Rolling baseline"];
            if (name === "spike") return [`${value}%`, "Spike"];
            return [value, name];
          }}
          labelFormatter={(v) => `Week of ${v}`}
        />
        <Area type="monotone" dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.06} />
        <Line type="monotone" dataKey="band" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" dot={false} />
        <Line type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2} dot={false} />
        <Scatter dataKey="spike" fill="var(--signal-high)" shape="circle" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

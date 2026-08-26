// src/components/risk/PolicySimulator.tsx
import { useMemo, useState } from "react";
import { TrendingDown } from "lucide-react";
import type { ThresholdSweepPoint, DriftSlice } from "@/api/types";
import { Panel } from "@/components/ui/atoms";
import ThresholdSlider from "@/components/risk/ThresholdSlider";

interface PolicySimulatorProps {
  sweep: ThresholdSweepPoint[];
  driftSlices: DriftSlice[];
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso.replace(" ", "T"));
  const end = new Date(endIso.replace(" ", "T"));
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Reframes the same threshold_sweep data already used elsewhere on the
 * Dashboard (CostCurveChart, the headline "expected monthly loss" stat)
 * as an interactive business-impact number instead of a single static
 * figure. Nothing here is a new backend computation — it's the existing
 * per-threshold expected_cost_inr, compared against the worst point in
 * the sweep (the highest threshold — barely flagging anything, the
 * closest available proxy to "no fraud detection at all") and scaled to
 * a monthly figure using the holdout set's own real date span, not a
 * guessed or hardcoded "30 days".
 */
export default function PolicySimulator({ sweep, driftSlices }: PolicySimulatorProps) {
  const [threshold, setThreshold] = useState(0.25);

  const monthsInHoldout = useMemo(() => {
    const start = driftSlices[0]?.date_range[0];
    const end = driftSlices[driftSlices.length - 1]?.date_range[1];
    if (!start || !end) return 1;
    return daysBetween(start, end) / 30.44;
  }, [driftSlices]);

  const closest = useMemo(
    () => sweep.reduce((best, p) => (Math.abs(p.threshold - threshold) < Math.abs(best.threshold - threshold) ? p : best), sweep[0]),
    [sweep, threshold]
  );

  // The highest-threshold point in the sweep flags almost nothing — the
  // closest available stand-in for "not running fraud detection at all".
  const doNothingBaseline = sweep[sweep.length - 1];

  const monthlySavings = (doNothingBaseline.expected_cost_inr - closest.expected_cost_inr) / monthsInHoldout;

  return (
    <Panel eyebrow="Policy simulator" title="What does this threshold actually save you?">
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>
        Compared against threshold {doNothingBaseline.threshold.toFixed(2)} — barely flagging anything, the
        closest available stand-in for running with no fraud detection — scaled to a monthly figure using the
        holdout set's real {monthsInHoldout.toFixed(1)}-month span.
      </p>

      <ThresholdSlider value={threshold} onChange={setThreshold} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 20, marginBottom: 16 }}>
        <TrendingDown size={22} color="var(--signal-low)" aria-hidden />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 600, color: "var(--signal-low)" }}>
          ₹{Math.round(Math.max(0, monthlySavings)).toLocaleString("en-IN")}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>/ month, projected</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          padding: "12px 14px",
          background: "var(--bg-base)",
          borderRadius: "var(--radius-sm)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Precision</div>
          {(closest.precision * 100).toFixed(1)}%
        </div>
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Recall</div>
          {(closest.recall * 100).toFixed(1)}%
        </div>
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Fraud missed</div>
          {closest.fn} orders
        </div>
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Wrongly flagged</div>
          {closest.fp} orders
        </div>
      </div>
    </Panel>
  );
}

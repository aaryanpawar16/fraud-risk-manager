// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, ShieldAlert, RotateCcw, Scale } from "lucide-react";
import { api } from "@/api/client";
import type { MetricsReport, BaselineComparison } from "@/api/types";
import { Panel, LoadingState, ErrorState, StatValue, StatWithDelta } from "@/components/ui/atoms";
import CostCurveChart from "@/components/charts/CostCurveChart";
import DriftChart from "@/components/charts/DriftChart";
import ROCCurveChart from "@/components/charts/ROCCurveChart";
import ConfusionMatrix from "@/components/charts/ConfusionMatrix";
import PolicySimulator from "@/components/risk/PolicySimulator";
import PageHeader from "@/components/layout/PageHeader";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<MetricsReport | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = () => {
    setStatus("loading");
    api
      .getMetrics()
      .then((data) => {
        setMetrics(data);
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      });
  };

  useEffect(load, []);

  if (status === "loading") {
    return (
      <PageShell>
        <LoadingState label="Loading model metrics" />
      </PageShell>
    );
  }

  if (status === "error" || !metrics) {
    return (
      <PageShell>
        <ErrorState message={errorMsg || "Metrics endpoint unavailable."} onRetry={load} />
      </PageShell>
    );
  }

  const best = metrics.best_cost_weighted_threshold;
  const driftSlices = metrics.drift_analysis_at_best_threshold;
  const firstSlice = driftSlices[0];
  const lastSlice = driftSlices[driftSlices.length - 1];
  const precisionDelta = lastSlice.precision - firstSlice.precision;
  const recallDelta = lastSlice.recall - firstSlice.recall;
  const isDrifting = Math.abs(precisionDelta) > 0.02;

  return (
    <PageShell>
      {isDrifting && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--signal-medium-bg)",
            border: "1px solid var(--signal-medium)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <ShieldAlert size={18} color="var(--signal-medium)" />
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-primary)" }}>
            Precision has {precisionDelta < 0 ? "dropped" : "risen"}{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--signal-medium)" }}>
              {Math.abs(precisionDelta * 100).toFixed(1)} pts
            </span>{" "}
            across the holdout period — recent orders may be using different tactics. Consider retraining.
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <ShieldAlert size={14} color="var(--text-muted)" />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text-secondary)" }}>
          Chargeback model
        </h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <Panel eyebrow="Ranking quality" title="ROC-AUC">
          <StatValue value={metrics.roc_auc.toFixed(3)} />
        </Panel>
        <Panel eyebrow="Cost-optimal cutoff" title="Threshold">
          <StatValue value={best.threshold.toFixed(2)} tone="accent" />
        </Panel>
        <Panel eyebrow="At cost-optimal threshold" title="Precision / Recall">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}>
            {(best.precision * 100).toFixed(1)}% / {(best.recall * 100).toFixed(1)}%
          </span>
        </Panel>
        <Panel eyebrow="Expected monthly loss" title="At current threshold">
          <StatValue value={`₹${best.expected_cost_inr.toLocaleString("en-IN")}`} />
        </Panel>
      </div>

      <div style={{ marginBottom: 20 }}>
        <PolicySimulator sweep={metrics.threshold_sweep} driftSlices={driftSlices} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 20 }}>
        <Panel eyebrow="Threshold sweep" title="Expected cost by threshold">
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
            FP cost ₹{metrics.cost_assumptions_inr.false_positive_cost} · FN cost ₹
            {metrics.cost_assumptions_inr.false_negative_cost}
          </p>
          <CostCurveChart sweep={metrics.threshold_sweep} optimalThreshold={best.threshold} />
        </Panel>

        <Panel eyebrow="Time-sliced holdout" title="Drift check">
          <div style={{ display: "flex", gap: 28, marginBottom: 12 }}>
            <StatWithDelta
              value={`${(lastSlice.recall * 100).toFixed(1)}`}
              unit="%"
              deltaText={`${Math.abs(recallDelta * 100).toFixed(1)}pts since Period 1`}
              deltaTone={recallDelta < -0.02 ? "negative" : recallDelta < 0 ? "neutral" : "positive"}
              deltaDirection={recallDelta < 0 ? "down" : recallDelta > 0 ? "up" : "flat"}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -8, marginBottom: 12 }}>Recall, most recent holdout period</p>
          <DriftChart slices={driftSlices} />
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <Panel eyebrow={`AUC ${metrics.roc_auc.toFixed(3)}`} title="ROC curve">
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 8 }}>
            The dashed diagonal is what a coin-flip model would look like. The further above it, the more real signal.
          </p>
          <ROCCurveChart sweep={metrics.threshold_sweep} />
        </Panel>

        <Panel eyebrow="At the cost-optimal threshold" title="Confusion matrix">
          <ConfusionMatrix point={best} />
        </Panel>
      </div>

      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <RotateCcw size={14} color="var(--text-muted)" />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text-secondary)" }}>
          Return-risk model <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>— separate model, trained on `returned`</span>
        </h2>
      </div>

      {metrics.return_model ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          <Panel eyebrow="Ranking quality" title="ROC-AUC">
            <StatValue value={metrics.return_model.roc_auc.toFixed(3)} />
          </Panel>
          <Panel eyebrow="Average precision" title="AP">
            <StatValue value={metrics.return_model.average_precision.toFixed(3)} />
          </Panel>
          <Panel eyebrow="Empirical band cutoffs" title="Medium / High">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}>
              {metrics.return_model.band_thresholds.medium.toFixed(2)} / {metrics.return_model.band_thresholds.high.toFixed(2)}
            </span>
          </Panel>
          <Panel eyebrow="Holdout" title="Base return rate">
            <StatValue value={(metrics.return_model.holdout_positive_rate * 100).toFixed(1)} unit="%" />
          </Panel>
        </div>
      ) : (
        <Panel>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            Return model not yet trained. Run <code>python train_return_model.py</code> inside <code>ml/</code>.
          </p>
        </Panel>
      )}

      {metrics.baseline_comparison && <BaselineComparisonSection comparison={metrics.baseline_comparison} />}

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)", fontSize: 12 }}>
        {precisionDelta < 0 ? <TrendingDown size={14} color="var(--signal-high)" /> : <TrendingUp size={14} color="var(--signal-low)" />}
        Holdout: {metrics.holdout_rows.toLocaleString("en-IN")} orders · positive rate {(metrics.holdout_positive_rate * 100).toFixed(1)}%
      </div>
    </PageShell>
  );
}

/** Answers "why XGBoost, not something simpler?" with a measured
 * comparison rather than an assumed answer. Reported honestly: on this
 * dataset, a plain logistic regression baseline slightly edges out
 * XGBoost (see ml/train_baseline_model.py for why — the synthetic data's
 * generative process is linear in log-odds by construction, which is
 * exactly logistic regression's own functional form). We still explain
 * why XGBoost remains the production choice rather than silently
 * switching or hiding the result. */
function BaselineComparisonSection({ comparison }: { comparison: BaselineComparison }) {
  const { xgboost, logistic_regression: logreg } = comparison.models;
  const xgbWins = comparison.roc_auc_improvement > 0;

  return (
    <>
      <div style={{ marginTop: 24, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Scale size={14} color="var(--text-muted)" />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text-secondary)" }}>
          Model choice — is XGBoost actually earning its complexity?
        </h2>
      </div>

      <Panel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              XGBoost (production model)
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 600 }}>{xgboost.roc_auc.toFixed(4)}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>ROC-AUC · AP {xgboost.average_precision.toFixed(4)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              Logistic regression (baseline)
            </div>
            <StatWithDelta
              value={logreg.roc_auc.toFixed(4)}
              deltaText={`${Math.abs(comparison.roc_auc_improvement * 100).toFixed(2)}pts vs XGBoost`}
              deltaTone={xgbWins ? "negative" : "neutral"}
              deltaDirection={xgbWins ? "down" : "up"}
            />
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>ROC-AUC · AP {logreg.average_precision.toFixed(4)}</div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            background: xgbWins ? "var(--signal-low-bg)" : "var(--signal-medium-bg)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1.6 }}>
            {xgbWins ? (
              <>
                XGBoost beats the baseline by <strong>+{comparison.roc_auc_improvement.toFixed(4)} ROC-AUC</strong> — the
                added complexity is measurably earning its keep here.
              </>
            ) : (
              <>
                On this holdout set, the plain logistic regression baseline actually scores{" "}
                <strong>{Math.abs(comparison.roc_auc_improvement).toFixed(4)} points higher</strong> on ROC-AUC than
                XGBoost. We're reporting that as-is rather than hiding it.
              </>
            )}
          </p>
        </div>

        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
          {!xgbWins && (
            <>
              This is expected, not a bug: our synthetic data generator builds risk as a linear combination of
              features passed through a sigmoid — exactly logistic regression's own functional form. Real
              transaction data typically has genuine feature interactions (e.g. "new account <em>and</em> high value{" "}
              <em>and</em> odd-hour order" being disproportionately risky beyond the sum of its parts) that tree
              ensembles like XGBoost are specifically good at capturing and linear models aren't.{" "}
            </>
          )}
          We kept XGBoost as the production model for reasons beyond this single benchmark: native SHAP
          TreeExplainer support (the per-order explanations throughout this console depend on it), and it's the more
          realistic choice for real-world data where interactions matter more than they do in this synthetic set.
        </p>
      </Panel>
    </>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader title="Dashboard" />
      {children}
    </div>
  );
}

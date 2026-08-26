// src/pages/FraudSpikes.tsx
import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, Bell, BellOff, BellRing } from "lucide-react";
import { api } from "@/api/client";
import type { FraudSpikeReport } from "@/api/types";
import { Panel, LoadingState, ErrorState, StatValue } from "@/components/ui/atoms";
import SpikeChart from "@/components/charts/SpikeChart";
import PageHeader from "@/components/layout/PageHeader";

export default function FraudSpikes() {
  const [report, setReport] = useState<FraudSpikeReport | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = () => {
    setStatus("loading");
    api
      .getFraudSpikes()
      .then((data) => {
        setReport(data);
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      });
  };

  useEffect(load, []);

  const spikeWeeks = report?.points.filter((p) => p.is_spike) ?? [];

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader
        title="Fraud-spike detector"
        action={
          report && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: report.spike_count > 0 ? "var(--signal-high)" : "var(--signal-low)",
                background: report.spike_count > 0 ? "var(--signal-high-bg)" : "var(--signal-low-bg)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {report.spike_count} spike{report.spike_count === 1 ? "" : "s"} detected
            </div>
          )
        }
      />

      {status === "ready" && report && <AlertStatusBanner report={report} />}

      {status === "loading" && (
        <Panel>
          <LoadingState label="Analyzing weekly fraud rate" />
        </Panel>
      )}
      {status === "error" && (
        <Panel>
          <ErrorState message={errorMsg} onRetry={load} />
        </Panel>
      )}

      {status === "ready" && report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
            <Panel eyebrow="Most recent week" title="Chargeback rate">
              <StatValue value={`${(report.latest_period.chargeback_rate * 100).toFixed(1)}`} unit="%" />
            </Panel>
            <Panel eyebrow="Deviation from baseline" title="Latest z-score">
              <StatValue
                value={report.latest_period.z_score !== null ? report.latest_period.z_score.toFixed(2) : "—"}
                tone={report.latest_period.is_spike ? "accent" : "primary"}
              />
            </Panel>
            <Panel eyebrow="Anomaly threshold" title="Flag if z-score exceeds">
              <StatValue value={report.z_score_threshold.toFixed(1)} />
            </Panel>
          </div>

          <Panel eyebrow={`Weekly, trailing ${report.points.length}-week window`} title="Chargeback rate over time">
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
              Red dots mark weeks where the rate deviated more than {report.z_score_threshold}σ above its own
              trailing 8-week baseline (dashed line). A different signal from per-order scoring — this one watches
              the aggregate rate the way a fraud-ops dashboard would.
            </p>
            <SpikeChart points={report.points} />
          </Panel>

          <Panel eyebrow="Flagged periods" title="Spike detail">
            <div style={{ marginTop: 4 }}>
              {spikeWeeks.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
                  <TrendingUp size={16} />
                  No weeks currently exceed the anomaly threshold.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {spikeWeeks.map((p) => (
                    <div
                      key={p.period_start}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "140px 100px 100px 120px 1fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 4px",
                        borderBottom: "1px solid var(--border-hairline)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)" }}>
                        <AlertTriangle size={13} color="var(--signal-high)" />
                        {p.period_start}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--signal-high)" }}>
                        {(p.chargeback_rate * 100).toFixed(1)}%
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        z = {p.z_score?.toFixed(2)}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 12 }}>
                        baseline {p.rolling_mean !== null ? (p.rolling_mean * 100).toFixed(1) : "—"}%
                      </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                        {p.order_count} orders, {p.chargeback_count} chargebacks that week
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/** Honest alert-status banner — three real states, not a decorative
 * "notifications on" toggle. Reflects exactly what the backend actually
 * did (see app/services/alerting.py): whether a webhook is configured
 * at all, and whether the current latest week is a spike that's already
 * triggered a real notification. */
function AlertStatusBanner({ report }: { report: FraudSpikeReport }) {
  const hasActiveSpike = report.latest_period.is_spike;

  let icon = <BellOff size={14} color="var(--text-muted)" />;
  let text = "Webhook alerting not configured — set ALERT_WEBHOOK_URL to enable.";
  let color = "var(--text-muted)";
  let bg = "transparent";

  if (report.alert_configured && hasActiveSpike && report.alert_sent_for_current_spike) {
    icon = <BellRing size={14} color="var(--signal-high)" />;
    text = `Alert sent for the week of ${report.latest_period.period_start} — webhook notified.`;
    color = "var(--signal-high)";
    bg = "var(--signal-high-bg)";
  } else if (report.alert_configured) {
    icon = <Bell size={14} color="var(--signal-low)" />;
    text = "Webhook alerting is live — no active spike to report right now.";
    color = "var(--signal-low)";
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: "var(--radius-sm)",
        background: bg,
        marginBottom: 16,
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        color,
      }}
    >
      {icon}
      {text}
    </div>
  );
}

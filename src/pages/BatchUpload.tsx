// src/pages/BatchUpload.tsx
import { useCallback, useRef, useState } from "react";
import { UploadCloud, Download, FileSpreadsheet, AlertCircle } from "lucide-react";
import { CircularProgress } from "@/components/ui/circular-progress";
import { api, resolveApiUrl } from "@/api/client";
import type { BatchScoreSummary } from "@/api/types";
import { Panel, ErrorState, RiskBadge, StatValue } from "@/components/ui/atoms";
import PageHeader from "@/components/layout/PageHeader";

const TEMPLATE_HEADER =
  "order_id,account_age_days,is_new_account,order_value,item_category,payment_method,discount_pct,shipping_billing_mismatch,ip_country_mismatch,device_reuse_signal,num_previous_orders,num_previous_returns,num_previous_chargebacks\n" +
  "ORD-EXAMPLE-1,30,false,2500,fashion,upi,10,false,false,false,3,0,0\n";

export default function BatchUpload() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [summary, setSummary] = useState<BatchScoreSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMsg("Please upload a .csv file.");
      setStatus("error");
      return;
    }
    setFileName(file.name);
    setStatus("uploading");
    setSummary(null);
    try {
      const result = await api.scoreBatch(file);
      setSummary(result);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_HEADER], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch_scoring_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader title="Batch scoring" />

      <Panel title="Upload an order export">
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
          Score an entire day's orders at once through both models. Every row needs the same fields as the{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); downloadTemplate(); }} style={{ color: "var(--accent)" }}>
            single-order form
          </a>{" "}
          — download a template to see the expected columns.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? "var(--accent)" : "var(--border-hairline-strong)"}`,
            borderRadius: "var(--radius-md)",
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: isDragging ? "var(--accent-bg)" : "var(--bg-base)",
            transition: "background 0.15s ease, border-color 0.15s ease",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = ""; // allow re-uploading the same filename
            }}
          />
          {status === "uploading" ? (
            <>
              <div style={{ margin: "0 auto 12px", display: "flex", justifyContent: "center" }}>
                <CircularProgress size={36} strokeWidth={3} />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Scoring {fileName}…</p>
            </>
          ) : (
            <>
              <UploadCloud size={28} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "0 0 4px", fontWeight: 500 }}>
                Drop a CSV here, or click to browse
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Up to 5,000 rows per upload</p>
            </>
          )}
        </div>

        {status === "error" && (
          <div style={{ marginTop: 16 }}>
            <ErrorState message={errorMsg} onRetry={() => setStatus("idle")} />
          </div>
        )}
      </Panel>

      {summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginTop: 16, marginBottom: 16 }}>
            <Panel eyebrow="Uploaded" title="Total rows">
              <StatValue value={summary.total_rows.toLocaleString("en-IN")} />
            </Panel>
            <Panel eyebrow="Chargeback" title="High risk">
              <StatValue value={summary.high_risk_count.toLocaleString("en-IN")} tone="accent" />
            </Panel>
            <Panel eyebrow="Chargeback" title="Medium risk">
              <StatValue value={summary.medium_risk_count.toLocaleString("en-IN")} />
            </Panel>
            <Panel eyebrow="Return model" title="High return risk">
              <StatValue value={summary.high_return_risk_count.toLocaleString("en-IN")} />
            </Panel>
            <Panel eyebrow="Parsing" title="Failed rows">
              <StatValue value={summary.failed_rows.toLocaleString("en-IN")} />
            </Panel>
          </div>

          <Panel
            title="Results"
            eyebrow={`Showing first ${Math.min(summary.preview_rows.length, summary.total_rows)} of ${summary.total_rows} rows`}
            action={
              <a
                href={resolveApiUrl(summary.csv_url)}
                download
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--accent)",
                  color: "#0b1220",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <Download size={14} /> Download full CSV
              </a>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={rowHeaderStyle}>
                <span>Row</span>
                <span>Order</span>
                <span>Chargeback risk</span>
                <span>Return risk</span>
                <span>Action</span>
              </div>
              {summary.preview_rows.map((row) => (
                <div key={row.row_number} style={rowStyle}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>#{row.row_number}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{row.order_id ?? "—"}</span>
                  {row.error ? (
                    <span style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: 6, color: "var(--signal-high)", fontSize: 12 }}>
                      <AlertCircle size={13} /> {row.error}
                    </span>
                  ) : (
                    <>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{((row.risk_score ?? 0) * 100).toFixed(1)}%</span>
                        {row.risk_band && <RiskBadge band={row.risk_band} size="sm" />}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{((row.return_risk_score ?? 0) * 100).toFixed(1)}%</span>
                        {row.return_risk_band && <RiskBadge band={row.return_risk_band} size="sm" />}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{row.recommended_action}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {summary.total_rows > summary.preview_rows.length && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <FileSpreadsheet size={13} />
                {summary.total_rows - summary.preview_rows.length} more rows scored — download the full CSV to see them all.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

const rowGridColumns = "60px 130px 1fr 1fr 130px";

const rowHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: rowGridColumns,
  gap: 12,
  alignItems: "center",
  padding: "0 4px 10px",
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border-hairline)",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: rowGridColumns,
  gap: 12,
  alignItems: "center",
  padding: "10px 4px",
  borderBottom: "1px solid var(--border-hairline)",
};

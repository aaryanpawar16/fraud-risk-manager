// src/pages/ScoreOrder.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import type { OrderInput, ScoreResult } from "@/api/types";
import { Panel, ErrorState } from "@/components/ui/atoms";
import ThresholdSlider from "@/components/risk/ThresholdSlider";
import ScoreCard from "@/components/risk/ScoreCard";
import PageHeader from "@/components/layout/PageHeader";

const CATEGORIES = ["electronics", "fashion", "beauty", "home", "grocery", "sports"];
const PAYMENT_METHODS = ["upi", "credit_card", "debit_card", "netbanking", "cod"];

const DEFAULT_ORDER: OrderInput = {
  account_age_days: 30,
  is_new_account: false,
  order_value: 2500,
  item_category: "fashion",
  payment_method: "upi",
  discount_pct: 10,
  shipping_billing_mismatch: false,
  ip_country_mismatch: false,
  device_reuse_signal: false,
  num_previous_orders: 3,
  num_previous_returns: 0,
  num_previous_chargebacks: 0,
};

export default function ScoreOrder() {
  const [order, setOrder] = useState<OrderInput>(DEFAULT_ORDER);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [threshold, setThreshold] = useState(0.25);

  const update = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) =>
    setOrder((prev) => ({ ...prev, [key]: value }));

  /** Cleans up a number input's displayed string once the user's done
   * editing it, without interfering while they're still typing. React's
   * controlled-input diffing can skip re-writing the DOM's raw string
   * when the parsed numeric value hasn't changed (e.g. a redundant
   * leading zero: "50" -> "050" both parse to 50), leaving a stale,
   * un-normalized string visible even though the real numeric state is
   * correct — normalizing only on blur, not on every keystroke, avoids
   * stripping a legitimately in-progress value like a trailing decimal
   * point ("12." on the way to "12.5") mid-type. */
  const normalizeNumberDisplay = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.value = String(Number(e.target.value) || 0);
  };

  const submit = async () => {
    setStatus("loading");
    try {
      const res = await api.scoreOrder(order);
      setResult(res);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader title="Score an order" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Panel title="Order details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Order value (₹)">
              <input
                type="number"
                value={order.order_value}
                onChange={(e) => update("order_value", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
            <Field label="Account age (days)">
              <input
                type="number"
                value={order.account_age_days}
                onChange={(e) => update("account_age_days", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
            <Field label="Category">
              <select
                value={order.item_category}
                onChange={(e) => update("item_category", e.target.value)}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={order.payment_method}
                onChange={(e) => update("payment_method", e.target.value)}
                style={inputStyle}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {p.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Discount applied (%)">
              <input
                type="number"
                value={order.discount_pct}
                onChange={(e) => update("discount_pct", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
            <Field label="Previous orders by customer">
              <input
                type="number"
                value={order.num_previous_orders}
                onChange={(e) => update("num_previous_orders", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
            <Field label="Previous chargebacks">
              <input
                type="number"
                value={order.num_previous_chargebacks}
                onChange={(e) => update("num_previous_chargebacks", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
            <Field label="Previous returns">
              <input
                type="number"
                value={order.num_previous_returns}
                onChange={(e) => update("num_previous_returns", Number(e.target.value))}
                onBlur={normalizeNumberDisplay}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <CheckboxRow
              label="Shipping address differs from billing"
              checked={order.shipping_billing_mismatch}
              onChange={(v) => update("shipping_billing_mismatch", v)}
            />
            <CheckboxRow
              label="Order IP doesn't match account country"
              checked={order.ip_country_mismatch}
              onChange={(v) => update("ip_country_mismatch", v)}
            />
            <CheckboxRow
              label="Device linked to other recent accounts"
              checked={order.device_reuse_signal}
              onChange={(v) => update("device_reuse_signal", v)}
            />
            <CheckboxRow
              label="New account (< 7 days old)"
              checked={order.is_new_account}
              onChange={(v) => update("is_new_account", v)}
            />
          </div>

          <button onClick={submit} disabled={status === "loading"} style={primaryButtonStyle}>
            {status === "loading" ? (
              <>
                <Loader2 size={14} className="spin" /> Scoring…
              </>
            ) : (
              "Score this order"
            )}
          </button>

          {status === "error" && <ErrorState message={errorMsg} onRetry={submit} />}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Decision threshold">
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8 }}>
              Orders scoring above this cutoff are flagged. Move it to see the tradeoff.
            </p>
            <ThresholdSlider value={threshold} onChange={setThreshold} />
          </Panel>

          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.order_id + result.risk_score}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <ScoreCard result={result} threshold={threshold} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
      {label}
      {children}
    </label>
  );
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
      {label}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 20,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: "var(--accent)",
  color: "#0b1220",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
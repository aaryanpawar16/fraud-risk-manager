// src/pages/ReviewQueue.tsx
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Filter, CheckCircle2, Ban, History, BellRing } from "lucide-react";
import { api } from "@/api/client";
import type { ReviewCase, RiskBand } from "@/api/types";
import { Panel, RiskBadge, SignalStrip, LoadingState, ErrorState, EmptyState } from "@/components/ui/atoms";
import PageHeader from "@/components/layout/PageHeader";

type FilterBand = Exclude<RiskBand, "low"> | "all";
type ResolvedAs = "approved" | "blocked";
type ViewMode = "pending" | "resolved";

// How long the "Approved"/"Blocked" confirmation shows in place of the
// action buttons before the row animates out of the pending list.
const CONFIRMATION_DISPLAY_MS = 1100;

export default function ReviewQueue() {
  const [view, setView] = useState<ViewMode>("pending");
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [resolvedCases, setResolvedCases] = useState<ReviewCase[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState<FilterBand>("all");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [justResolved, setJustResolved] = useState<Record<string, ResolvedAs>>({});

  const loadPending = () => {
    setStatus("loading");
    api
      .getReviewQueue()
      .then((data) => {
        setCases(data.filter((c) => c.status === "pending"));
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      });
  };

  const loadResolved = () => {
    setStatus("loading");
    api
      .getResolvedCases()
      .then((data) => {
        setResolvedCases(data);
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      });
  };

  useEffect(() => {
    if (view === "pending") loadPending();
    else loadResolved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const resolve = async (orderId: string, action: ResolvedAs) => {
    setResolvingId(orderId);
    try {
      await api.resolveReviewCase(orderId, action);
      // Show the confirmation state first — swap the action buttons for a
      // clear "Approved"/"Blocked" label — rather than having the row
      // vanish the instant the request succeeds, which gave no visible
      // sign the click actually did anything.
      setJustResolved((prev) => ({ ...prev, [orderId]: action }));
      setTimeout(() => {
        setCases((prev) => prev.filter((c) => c.order_id !== orderId));
        setJustResolved((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
      }, CONFIRMATION_DISPLAY_MS);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not update this case");
    } finally {
      setResolvingId(null);
    }
  };

  const filtered = useMemo(() => {
    const source = view === "pending" ? cases : resolvedCases;
    return filter === "all" ? source : source.filter((c) => c.risk_band === filter);
  }, [view, cases, resolvedCases, filter]);

  const reload = () => (view === "pending" ? loadPending() : loadResolved());

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader
        title="Review queue"
        action={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Filter size={14} color="var(--text-muted)" />
            {(["all", "high", "medium"] as FilterBand[]).map((band) => (
              <button
                key={band}
                onClick={() => setFilter(band)}
                style={{
                  background: filter === band ? "var(--accent-bg)" : "transparent",
                  color: filter === band ? "var(--accent)" : "var(--text-muted)",
                  border: `1px solid ${filter === band ? "var(--accent)" : "var(--border-hairline-strong)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {band}
              </button>
            ))}
          </div>
        }
      />

      {/* Pending / Resolved tabs. Resolved is the audit trail — every case
          that's been approved or blocked, persisted in SQLite so it
          survives a server restart (unlike the earlier in-memory store,
          where a resolved case simply had nowhere to be seen again). */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <TabButton active={view === "pending"} onClick={() => setView("pending")} icon={<Filter size={13} />} label="Pending" />
        <TabButton active={view === "resolved"} onClick={() => setView("resolved")} icon={<History size={13} />} label="Resolved" />
      </div>

      <Panel>
        {status === "loading" && <LoadingState label={view === "pending" ? "Loading review queue" : "Loading resolved cases"} />}
        {status === "error" && <ErrorState message={errorMsg} onRetry={reload} />}
        {status === "ready" && filtered.length === 0 && (
          <EmptyState
            label={
              view === "pending"
                ? cases.length === 0
                  ? "Queue is clear — nothing pending review."
                  : "No cases match this filter."
                : resolvedCases.length === 0
                ? "No decisions made yet — approve or block a case to see it here."
                : "No cases match this filter."
            }
          />
        )}

        {status === "ready" && filtered.length > 0 && view === "pending" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={rowHeaderStyle}>
              <span></span>
              <span>Order</span>
              <span>Customer</span>
              <span>Value</span>
              <span>Score</span>
              <span>Flagged for</span>
              <span>Flagged at</span>
              <span>Action</span>
            </div>
            <AnimatePresence initial={false}>
              {filtered.map((c) => (
                <PendingRow
                  key={c.order_id}
                  caseItem={c}
                  resolving={resolvingId === c.order_id}
                  resolvedAs={justResolved[c.order_id]}
                  onApprove={() => resolve(c.order_id, "approved")}
                  onBlock={() => resolve(c.order_id, "blocked")}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {status === "ready" && filtered.length > 0 && view === "resolved" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={resolvedRowHeaderStyle}>
              <span></span>
              <span>Order</span>
              <span>Customer</span>
              <span>Value</span>
              <span>Score</span>
              <span>Flagged for</span>
              <span>Decision</span>
              <span>Resolved at</span>
            </div>
            {filtered.map((c) => (
              <ResolvedRow key={c.order_id} caseItem={c} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: active ? "var(--bg-surface)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border-hairline-strong)" : "transparent"}`,
        borderBottom: active ? "2px solid var(--accent)" : "1px solid transparent",
        borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PendingRow({
  caseItem,
  resolving,
  resolvedAs,
  onApprove,
  onBlock,
}: {
  caseItem: ReviewCase;
  resolving: boolean;
  resolvedAs?: ResolvedAs;
  onApprove: () => void;
  onBlock: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        ...rowStyle,
        background: resolvedAs === "approved" ? "var(--signal-low-bg)" : resolvedAs === "blocked" ? "var(--signal-high-bg)" : "transparent",
        transition: "background 0.2s ease",
      }}
    >
      <SignalStrip band={caseItem.risk_band} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{caseItem.order_id}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)" }}>
        {caseItem.customer_id}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
        ₹{caseItem.order_value.toLocaleString("en-IN")}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <RiskBadge band={caseItem.risk_band} size="sm" />
        {caseItem.alert_sent && (
          <span title="Ops team notified via webhook when this case was flagged">
            <BellRing size={12} color="var(--signal-high)" aria-hidden />
          </span>
        )}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{caseItem.top_reason_label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
        {new Date(caseItem.flagged_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </span>

      {resolvedAs ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: resolvedAs === "approved" ? "var(--signal-low)" : "var(--signal-high)",
          }}
        >
          {resolvedAs === "approved" ? <CheckCircle2 size={14} /> : <Ban size={14} />}
          {resolvedAs === "approved" ? "Approved" : "Blocked"}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onApprove} disabled={resolving} title="Approve order" style={actionButtonStyle("var(--signal-low)")}>
            <Check size={14} />
          </button>
          <button onClick={onBlock} disabled={resolving} title="Block order" style={actionButtonStyle("var(--signal-high)")}>
            <X size={14} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Read-only row for the Resolved (audit trail) tab — no action buttons,
 * since the decision has already been made. Shows what was decided and
 * when, which is the whole point of this tab existing. */
function ResolvedRow({ caseItem }: { caseItem: ReviewCase }) {
  const isApproved = caseItem.status === "approved";
  return (
    <div style={resolvedRowStyle}>
      <SignalStrip band={caseItem.risk_band} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{caseItem.order_id}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)" }}>
        {caseItem.customer_id}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
        ₹{caseItem.order_value.toLocaleString("en-IN")}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <RiskBadge band={caseItem.risk_band} size="sm" />
        {caseItem.alert_sent && (
          <span title="Ops team notified via webhook when this case was flagged">
            <BellRing size={12} color="var(--signal-high)" aria-hidden />
          </span>
        )}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{caseItem.top_reason_label}</span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: isApproved ? "var(--signal-low)" : "var(--signal-high)",
        }}
      >
        {isApproved ? <CheckCircle2 size={14} /> : <Ban size={14} />}
        {isApproved ? "Approved" : "Blocked"}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
        {caseItem.resolved_at
          ? new Date(caseItem.resolved_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "—"}
      </span>
    </div>
  );
}

function actionButtonStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  };
}

const rowGridColumns = "16px 110px 110px 100px 110px 1fr 150px 76px";
const resolvedRowGridColumns = "16px 110px 110px 100px 110px 1fr 100px 150px";

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

const resolvedRowHeaderStyle: React.CSSProperties = {
  ...rowHeaderStyle,
  gridTemplateColumns: resolvedRowGridColumns,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: rowGridColumns,
  gap: 12,
  alignItems: "center",
  padding: "12px 4px",
  borderBottom: "1px solid var(--border-hairline)",
};

const resolvedRowStyle: React.CSSProperties = {
  ...rowStyle,
  gridTemplateColumns: resolvedRowGridColumns,
};

// src/pages/AbuseGraph.tsx
import { useEffect, useState } from "react";
import { Users, Smartphone, MapPin } from "lucide-react";
import { api } from "@/api/client";
import type { AbuseGraphData, GraphNode, RingSummary } from "@/api/types";
import { Panel, LoadingState, ErrorState, EmptyState } from "@/components/ui/atoms";
import ForceGraph, { NODE_TYPE_COLOR } from "@/components/graph/ForceGraph";
import PageHeader from "@/components/layout/PageHeader";

export default function AbuseGraph() {
  const [data, setData] = useState<AbuseGraphData | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const load = () => {
    setStatus("loading");
    api
      .getAbuseGraph()
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      });
  };

  useEffect(load, []);

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader
        title="Abuse-ring sentinel"
        action={
          data && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--signal-medium)",
                background: "var(--signal-medium-bg)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                boxShadow: "inset 0 0 0 1px rgba(229,167,62,0.25)",
              }}
            >
              {data.ring_count} rings detected
            </div>
          )
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <Panel title="Shared-identity network" eyebrow="Customers linked by device or address">
          {status === "loading" && (
            <div style={{ height: 520 }}>
              <LoadingState label="Building the network" />
            </div>
          )}
          {status === "error" && (
            <div style={{ height: 520 }}>
              <ErrorState message={errorMsg} onRetry={load} />
            </div>
          )}
          {status === "ready" && data && data.nodes.length === 0 && (
            <div style={{ height: 520 }}>
              <EmptyState label="No shared devices or addresses found across recent orders." />
            </div>
          )}
          {status === "ready" && data && data.nodes.length > 0 && (
            <ForceGraph nodes={data.nodes} links={data.links} onNodeClick={setSelectedNode} />
          )}
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12 }}>
            <LegendItem color={NODE_TYPE_COLOR.customer} icon={<Users size={12} />} label="Customer" />
            <LegendItem color={NODE_TYPE_COLOR.device} icon={<Smartphone size={12} />} label="Device" />
            <LegendItem color={NODE_TYPE_COLOR.address} icon={<MapPin size={12} />} label="Address" />
          </div>
        </Panel>

        <Panel title="Node detail">
          {selectedNode ? (
            <NodeDetailPanel node={selectedNode} rings={data?.rings ?? []} />
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Click a node to see details.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function NodeDetailPanel({ node, rings }: { node: GraphNode; rings: RingSummary[] }) {
  const ring = rings.find((r) => r.ring_id === node.ring_id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {node.type}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, marginTop: 2 }}>{node.label}</div>
      </div>

      {node.risk_score !== undefined && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Associated risk score</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--signal-medium)" }}>
            {(node.risk_score * 100).toFixed(0)}
          </div>
        </div>
      )}

      {ring && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: ring.connection_type === "address" ? "var(--text-secondary)" : "var(--signal-high)",
            }}
          >
            {ring.connection_type !== "address" && <Smartphone size={13} />}
            {ring.connection_type !== "device" && <MapPin size={13} />}
            {ring.connection_type === "both"
              ? "Connected via shared device AND address"
              : `Connected via shared ${ring.connection_type}`}
            {ring.connection_type === "device" && " — a stronger signal than a shared address"}
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
              {ring.customer_count} customer{ring.customer_count !== 1 ? "s" : ""} in this ring
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ring.members.map((m) => {
                const isSelected = m.label === node.label;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "var(--accent-bg)" : "transparent",
                    }}
                  >
                    <span style={{ color: isSelected ? "var(--accent)" : "var(--text-secondary)" }}>{m.label}</span>
                    <span style={{ color: m.risk_score >= 0.5 ? "var(--signal-high)" : "var(--text-muted)" }}>
                      {(m.risk_score * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {node.type === "customer"
          ? "This customer shares an identifier with the other accounts above. Review their order history before approving high-value orders."
          : `This ${node.type} is linked to multiple customer accounts — a common signature of an abuse ring.`}
      </p>
    </div>
  );
}

function LegendItem({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
      <span style={{ color }}>{icon}</span>
      {label}
    </span>
  );
}

// src/pages/Evidence.tsx
import { useState } from "react";
import { FileText, Download, Loader2, Search, ShieldCheck, Smartphone, History, Share2, MapPin, ScrollText } from "lucide-react";
import { api, resolveApiUrl } from "@/api/client";
import type { EvidencePacket } from "@/api/types";
import { Panel, ErrorState } from "@/components/ui/atoms";
import PageHeader from "@/components/layout/PageHeader";

const SECTION_ICON: Record<string, typeof FileText> = {
  "Order details": FileText,
  "Risk assessment at time of scoring": ShieldCheck,
  "Device & IP match": Smartphone,
  "Customer order history": History,
  "Network check — shared-identity rings": Share2,
  "Shipping & billing match": MapPin,
  "Merchant policy reference": ScrollText,
};

/** Sections that disclose a real flag say so in their own text ("Flag
 * on file: ..."). Detecting that here — rather than adding a separate
 * boolean field just for icon color — keeps the single source of truth
 * in the backend's actual generated content, not a second signal that
 * could drift out of sync with it. */
function isFlagged(content: string): boolean {
  return content.startsWith("Flag on file");
}

export default function Evidence() {
  const [orderId, setOrderId] = useState("");
  const [packet, setPacket] = useState<EvidencePacket | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const generate = async () => {
    if (!orderId.trim()) return;
    setStatus("loading");
    setPacket(null);
    try {
      const res = await api.generateEvidence(orderId.trim());
      setPacket(res);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not generate evidence packet");
      setStatus("error");
    }
  };

  return (
    <div style={{ padding: 24, position: "relative", zIndex: 1 }}>
      <PageHeader title="Chargeback evidence" />

      <Panel title="Compile an evidence packet">
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
          Enter an order ID to auto-assemble delivery proof, device/IP match, order history, and policy
          references into a submission-ready dispute response.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} color="var(--text-muted)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="ORD-0004821"
              style={{
                width: "100%",
                background: "var(--bg-base)",
                border: "1px solid var(--border-hairline-strong)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                padding: "9px 12px 9px 32px",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>
          <button onClick={generate} disabled={status === "loading" || !orderId.trim()} style={primaryButtonStyle}>
            {status === "loading" ? <Loader2 size={14} className="spin" /> : "Generate"}
          </button>
        </div>
        {status === "error" && <ErrorState message={errorMsg} onRetry={generate} />}
      </Panel>

      {packet && (
        <div style={{ marginTop: 16 }}>
          <Panel
            title={`Evidence packet — ${packet.order_id}`}
            eyebrow={`Generated ${new Date(packet.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · ${flaggedCount(packet)} of ${packet.sections.length} checks flagged`}
            action={
              <a
                href={resolveApiUrl(packet.pdf_url)}
                download={`${packet.order_id}.pdf`}
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
                <Download size={14} /> Download PDF
              </a>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {packet.sections.map((section) => {
                const Icon = SECTION_ICON[section.title] ?? FileText;
                const flagged = isFlagged(section.content);
                const iconColor = !section.included ? "var(--text-muted)" : flagged ? "var(--signal-medium)" : "var(--accent)";
                return (
                  <div
                    key={section.title}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "14px 4px",
                      borderBottom: "1px solid var(--border-hairline)",
                      opacity: section.included ? 1 : 0.45,
                    }}
                  >
                    <Icon size={16} color={iconColor} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{section.title}</span>
                        {flagged && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--signal-medium)",
                              fontFamily: "var(--font-mono)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              background: "var(--signal-medium-bg)",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            Flagged
                          </span>
                        )}
                        {!section.included && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            not available for this order
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                        {section.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function flaggedCount(packet: EvidencePacket): number {
  return packet.sections.filter((s) => isFlagged(s.content)).length;
}

const primaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: "var(--accent)",
  color: "#0b1220",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "0 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minWidth: 110,
};

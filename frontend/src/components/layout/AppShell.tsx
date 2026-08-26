// src/components/layout/AppShell.tsx
import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, ShieldCheck, ListChecks, Share2, FileText, ShieldAlert, TrendingUp, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "@/api/client";

const NAV_ITEMS: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/score", label: "Score order", icon: ShieldCheck },
  { to: "/app/batch", label: "Batch scoring", icon: FileSpreadsheet },
  { to: "/app/review", label: "Review queue", icon: ListChecks },
  { to: "/app/graph", label: "Abuse rings", icon: Share2 },
  { to: "/app/spikes", label: "Fraud spikes", icon: TrendingUp },
  { to: "/app/evidence", label: "Evidence", icon: FileText },
];

export default function AppShell() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          // Static, non-animated ambient texture — a very faint dot grid
          // plus a soft top-left radial tint. Deliberately restrained and
          // motionless, unlike the landing page's particle/wave effects,
          // so the console reads as a data tool rather than a marketing
          // surface.
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(167,173,186,0.06) 1px, transparent 0), radial-gradient(900px 500px at -5% -10%, rgba(91,141,239,0.05), transparent 60%)",
          backgroundSize: "24px 24px, 100% 100%",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar() {
  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid var(--border-hairline)",
        background: "var(--bg-surface)",
        boxShadow: "2px 0 12px -4px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 12px",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Link
        to="/"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px", marginBottom: 28, textDecoration: "none" }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent-bg)",
            boxShadow: "0 0 0 1px rgba(91,141,239,0.25), 0 0 16px -4px rgba(91,141,239,0.5)",
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={16} color="var(--accent)" aria-hidden />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)", lineHeight: 1.25 }}>
            Fraud Risk Manager
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
            AI RISK CONSOLE
          </div>
        </div>
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={({ isActive }) => ({
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px 9px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              color: isActive ? "var(--nav-active)" : "var(--text-secondary)",
              background: isActive ? "var(--nav-active-bg)" : "transparent",
              transition: "background 0.15s ease, color 0.15s ease",
            })}
            onMouseEnter={(e) => {
              const isActive = e.currentTarget.getAttribute("aria-current") === "page";
              if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              const isActive = e.currentTarget.getAttribute("aria-current") === "page";
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 16,
                      borderRadius: 2,
                      background: "var(--nav-active)",
                      boxShadow: "0 0 8px var(--nav-active)",
                    }}
                  />
                )}
                <Icon size={16} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div style={{ marginTop: "auto", padding: "12px 8px 0", borderTop: "1px solid var(--border-hairline)" }}>
        <BackendStatusIndicator />
      </div>
    </nav>
  );
}

type BackendStatus = "checking" | "connected" | "disconnected";

// Polls the real health endpoint rather than showing a static "connected"
// label — this used to be a hardcoded green dot that never checked
// anything, which is a real problem in a product whose whole pitch is
// honest metrics. Starts in "checking" (not a defaulted lie of either
// color) and re-polls periodically so a mid-session backend restart
// (e.g. Render's free tier) actually gets reflected instead of staying
// stuck on whatever the first load happened to show.
const HEALTH_POLL_INTERVAL_MS = 20000;

function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await api.checkHealth();
        if (!cancelled) setStatus("connected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    };

    check();
    const interval = setInterval(check, HEALTH_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}

const STATUS_COPY: Record<BackendStatus, { label: string; color: string }> = {
  checking: { label: "Checking backend…", color: "var(--text-muted)" },
  connected: { label: "Backend connected", color: "var(--signal-low)" },
  disconnected: { label: "Backend unreachable", color: "var(--signal-high)" },
};

function BackendStatusIndicator() {
  const status = useBackendStatus();
  const { label, color } = STATUS_COPY[status];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
      {status === "checking" ? (
        <Loader2 size={9} className="spin" color={color} aria-hidden />
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }}
          aria-hidden
        />
      )}
      {label}
    </div>
  );
}
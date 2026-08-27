// src/components/ui/secure-access-transition.tsx
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, Check } from "lucide-react";
import { WavyBackground } from "@/components/ui/wavy-background";
import { SparklesCore } from "@/components/ui/sparkles";

type Stage = "closed" | "open" | "done";

/**
 * The landing page's "enter the console" ceremony. Structurally and
 * decoratively modeled closely on a reference video (an ornate
 * document-cover card that opens into a two-page spread with a visible
 * center crease) -- same frame details (double-border with corner
 * brackets, a visible "spine" edge on the closed cover, a stamp-style
 * badge on the open right page) -- but recolored to this app's actual
 * dark/blue palette rather than the reference's forest-green-and-gold,
 * so it doesn't clash with every other dark-themed page in the console.
 *
 * Includes the same wavy-background and sparkles layers used on the
 * rest of the landing page (identical config — waveOpacity 0.22, blur
 * 16, "slow" speed; particleDensity 90, particleColor #5b8def) so the
 * overlay doesn't feel like a visually disconnected screen dropped on
 * top of the page it interrupts.
 *
 * Respects prefers-reduced-motion by calling onReveal then onComplete
 * immediately, with no animation shown at all -- same convention as
 * every other animation in this codebase. Since the
 * whole component bails out before rendering anything in that case,
 * these background layers (and the scan-line, and the 3D stamp effect)
 * never mount at all under reduced motion — no separate guard needed
 * for each individually.
 */
export default function SecureAccessTransition({
  onReveal,
  onComplete,
}: {
  /** Called once, the instant the sequence is ready to reveal the real
   * app underneath — triggers navigate("/app") in App.tsx. Fires WHILE
   * this overlay is still fully opaque, so the new route has time to
   * mount hidden behind it before any transparency starts. */
  onReveal: () => void;
  /** Called once, after this overlay's own exit animation has finished
   * playing — tells App.tsx it's safe to unmount this component
   * entirely, revealing the (already-mounted) app cleanly underneath. */
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<Stage>("closed");

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onReveal();
      onComplete();
      return;
    }
    const toOpen = setTimeout(() => setStage("open"), 2200);
    const toDone = setTimeout(() => {
      setStage("done");
      onReveal(); // navigate now, while still fully opaque -- new route mounts hidden behind this overlay
    }, 4400);
    const finish = setTimeout(onComplete, 4800); // then, after the fade/flash finishes, hand off cleanly
    return () => {
      clearTimeout(toOpen);
      clearTimeout(toDone);
      clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: stage === "done" ? 0 : 1 }}
        transition={{ duration: 0.35 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <WavyBackground waveOpacity={0.22} blur={16} speed="slow" />
        </div>
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <SparklesCore
            background="transparent"
            minSize={0.4}
            maxSize={1.1}
            particleDensity={90}
            particleColor="#5b8def"
            speed={2}
            className="h-full w-full"
          />
        </div>

      <button
        onClick={() => {
          onReveal();
          onComplete();
        }}
        style={{
          position: "absolute",
          zIndex: 1,
          bottom: 28,
          right: 32,
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          cursor: "pointer",
          letterSpacing: "0.04em",
        }}
      >
        Skip intro →
      </button>

      <AnimatePresence mode="wait">
        {stage === "closed" && (
          <motion.div
            key="closed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            style={{ position: "relative", zIndex: 1, width: 340, filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.6))" }}
          >
            {/* Spine edge -- a sliver of lighter tone on the right side,
                suggesting the closed cover has real thickness. */}
            <div
              style={{
                position: "absolute",
                right: -7,
                top: 6,
                bottom: 6,
                width: 7,
                background: "var(--bg-surface-raised)",
                borderRadius: "0 3px 3px 0",
              }}
            />
            <div
              style={{
                position: "relative",
                padding: 3,
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 0 0 1px var(--border-hairline-strong)",
                overflow: "hidden",
              }}
            >
              <div
                className="scan-sweep-line"
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "linear-gradient(90deg, transparent, var(--accent) 45%, var(--accent) 55%, transparent)",
                  boxShadow: "0 0 16px 3px rgba(91,141,239,0.65)",
                  zIndex: 2,
                }}
              />
              {/* Inner double-border frame with corner brackets */}
              <div
                style={{
                  position: "relative",
                  margin: 10,
                  padding: "34px 26px",
                  border: "1px solid rgba(91,141,239,0.35)",
                  textAlign: "center",
                }}
              >
                {[
                  { top: -1, left: -1, borderRight: "none", borderBottom: "none" },
                  { top: -1, right: -1, borderLeft: "none", borderBottom: "none" },
                  { bottom: -1, left: -1, borderRight: "none", borderTop: "none" },
                  { bottom: -1, right: -1, borderLeft: "none", borderTop: "none" },
                ].map((corner, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      width: 14,
                      height: 14,
                      border: "1.5px solid var(--accent)",
                      ...corner,
                    }}
                  />
                ))}

                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 26 }}>
                  CONFIDENTIAL · LIVE SYSTEM
                </div>

                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
                  Fraud Risk Manager
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--accent)", letterSpacing: "0.1em", marginTop: 8 }}>
                  AI RISK CONSOLE
                </div>

                <div
                  style={{
                    width: 26,
                    height: 26,
                    margin: "22px auto",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(91,141,239,0.4)",
                  }}
                >
                  <ShieldAlert size={13} color="var(--accent)" aria-hidden />
                </div>

                <div style={{ height: 1, background: "rgba(91,141,239,0.25)", margin: "0 auto 16px" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                  AUTHENTICATED · AUDIT ENFORCED
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "open" && (
          <motion.div
            key="open"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.5 }}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              width: 660,
              borderRadius: "var(--radius-md)",
              boxShadow: "0 0 0 1px var(--border-hairline-strong), 0 30px 60px -20px rgba(0,0,0,0.7)",
              filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.5))",
            }}
          >
            {/* Left page */}
            <div
              style={{
                flex: 1,
                padding: "36px 28px",
                background: "var(--bg-surface-raised)",
                borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                textAlign: "center",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                FOLIO // NO. 001
              </div>
              <div>
                <ShieldAlert size={22} color="var(--accent)" style={{ margin: "0 auto 14px" }} aria-hidden />
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
                  Fraud Risk Manager
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 6 }}>
                  SYSTEM LEDGER
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                CONFIDENTIAL · ACCESS LOG
              </div>
            </div>

            {/* Center crease */}
            <div style={{ width: 2, background: "var(--bg-base)", boxShadow: "0 0 8px 1px rgba(0,0,0,0.6)" }} />

            {/* Right page */}
            <div
              style={{
                flex: 1.15,
                padding: "30px 28px",
                background: "var(--bg-surface-raised)",
                borderRadius: "0 var(--radius-md) var(--radius-md) 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 18 }}>
                <span>SYSTEM STATUS</span>
                <span>LIVE</span>
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600, color: "var(--text-primary)" }}>
                0.767 <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>ROC-AUC</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 18 }}>
                103 automated tests, all passing
              </div>

              <motion.div
                initial={{ opacity: 0, scale: 2.4, rotateX: -55, rotateZ: -2 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0, rotateZ: -2 }}
                transition={{ delay: 0.55, type: "spring", stiffness: 260, damping: 18 }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 11px",
                  borderRadius: 4,
                  border: "1px solid var(--signal-low)",
                  color: "var(--signal-low)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  transformPerspective: 500,
                }}
              >
                <Check size={11} /> SYSTEM ACTIVE
              </motion.div>

              <div style={{ marginTop: 22, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-muted)" }}>
                Loading console…
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Portal flash — a brief light pulse right before the dashboard is
        revealed, rendered as an independent sibling (not nested inside
        the overlay above) specifically so it isn't diluted by that
        container's own simultaneous fade-to-0 opacity — it needs to hit
        its own full peak brightness on its own terms. Timed to fit
        inside the 400ms window between stage "done" starting (4400ms)
        and onComplete firing (4800ms). */}
    {stage === "done" && (
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.4, times: [0, 0.35, 1], ease: "easeOut" }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 201,
          background: "var(--accent)",
          pointerEvents: "none",
        }}
      />
    )}
    </>
  );
}
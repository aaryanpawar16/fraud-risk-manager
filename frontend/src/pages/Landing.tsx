// src/pages/Landing.tsx
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";
import {
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  FileText,
  Share2,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  FileSpreadsheet,
  Scale,
  IndianRupee,
  BellRing,
  Activity,
  Github,
} from "lucide-react";
import { SparklesCore } from "@/components/ui/sparkles";
import { WavyBackground } from "@/components/ui/wavy-background";
import { CardSpotlight } from "@/components/ui/card-spotlight";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Chargeback risk scoring",
    description:
      "Every order gets a real-time fraud risk score from a gradient-boosted model, with SHAP-backed reasons a human can actually read — not a black-box number.",
  },
  {
    icon: RotateCcw,
    title: "Return risk, from a separate model",
    description:
      "Not a proxy for chargeback risk. A second model, trained and evaluated independently on real return outcomes, with its own empirically-calibrated risk bands.",
  },
  {
    icon: TrendingUp,
    title: "Fraud-spike detector",
    description:
      "Rolling z-score anomaly detection on weekly chargeback rate — flags when fraud is trending up across your whole book, not just which single order looks risky.",
  },
  {
    icon: Share2,
    title: "Abuse-ring sentinel",
    description:
      "Graph clustering surfaces customers quietly sharing a device or address — the pattern serial return/chargeback rings rely on to stay hidden.",
  },
  {
    icon: FileText,
    title: "Chargeback evidence, auto-compiled",
    description:
      "One click assembles delivery proof, device/IP match, and order history into a submission-ready dispute packet — before you lose the chargeback by default.",
  },
  {
    icon: FileSpreadsheet,
    title: "Batch CSV scoring",
    description:
      "Score an entire day's orders at once. Upload a CSV, get every row risk-scored through both models, download an annotated report your ops team can act on.",
  },
  {
    icon: SlidersHorizontal,
    title: "Cost-weighted decisions",
    description:
      "Set your real ₹ cost for false positives vs. missed fraud and the threshold moves with it — not a generic accuracy score that ignores your margins.",
  },
  {
    icon: IndianRupee,
    title: "Policy simulator",
    description:
      "Move the threshold slider and watch projected monthly savings update live, in ₹ — the same cost data reframed as business impact, not just a model metric.",
  },
  {
    icon: TrendingDown,
    title: "Drift monitoring",
    description:
      "Precision and recall are tracked across time-sliced holdout data, so you know the moment fraud tactics shift instead of finding out from your P&L.",
  },
  {
    icon: Activity,
    title: "ROC curve & confusion matrix",
    description:
      "Model quality you can actually see, not just a table of numbers — plotted directly from the same holdout evaluation everything else on this page is built on.",
  },
  {
    icon: Scale,
    title: "Baseline-tested, not assumed",
    description:
      "We benchmarked our production model against a plain logistic regression on identical data — and report the result honestly, including where the simpler model wins.",
  },
  {
    icon: BellRing,
    title: "Real webhook alerts, not a dashboard to remember",
    description:
      "A genuine HTTP POST fires the moment a fraud spike or a high-risk case appears — proven end-to-end against a real receiver, not a notifications toggle that does nothing.",
  },
] as const;

type StatItem =
  | { kind: "number"; label: string; value: number; decimals: number; suffix?: string; prefix?: string }
  | { kind: "text"; label: string; display: string };

const STATS: StatItem[] = [
  { kind: "number", label: "ROC-AUC on held-out data", value: 0.767, decimals: 3 },
  { kind: "text", label: "Time-based split, verified by tests", display: "Zero leakage" },
  { kind: "number", label: "Automated tests, all passing", value: 93, decimals: 0, suffix: "/93" },
];

export default function Landing({ onEnterConsole }: { onEnterConsole: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <div style={{ background: "var(--bg-base)", color: "var(--text-primary)", minHeight: "100vh", overflowX: "hidden" }}>
      <BackgroundGlow reduceMotion={!!reduceMotion} />
      <WavyPageLayer reduceMotion={reduceMotion} />
      <SparklesPageLayer reduceMotion={reduceMotion} />
      <Nav onEnterConsole={onEnterConsole} />
      <Hero reduceMotion={!!reduceMotion} onEnterConsole={onEnterConsole} />
      <StatsStrip />
      <Features />
      <ClosingCTA onEnterConsole={onEnterConsole} />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient background — two soft, slow-drifting glows. Disabled entirely under
// prefers-reduced-motion rather than just slowed down.
// ---------------------------------------------------------------------------
function BackgroundGlow({ reduceMotion }: { reduceMotion: boolean }) {
  if (reduceMotion) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }} aria-hidden>
      <motion.div
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: "-10%",
          left: "-5%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,141,239,0.16) 0%, rgba(91,141,239,0) 70%)",
        }}
      />
      <motion.div
        animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          bottom: "-15%",
          right: "-5%",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(229,167,62,0.10) 0%, rgba(229,167,62,0) 70%)",
        }}
      />
    </div>
  );
}

function Nav({ onEnterConsole }: { onEnterConsole: () => void }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 32px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>Fraud Risk Manager</span>
      </div>
      <button
        onClick={onEnterConsole}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--text-secondary)",
          background: "none",
          border: "1px solid var(--border-hairline-strong)",
          borderRadius: "var(--radius-sm)",
          padding: "7px 14px",
          cursor: "pointer",
        }}
      >
        Open console →
      </button>
    </motion.header>
  );
}

function Hero({ reduceMotion, onEnterConsole }: { reduceMotion: boolean; onEnterConsole: () => void }) {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  return (
    <section
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 780,
        margin: "0 auto",
        padding: "96px 24px 64px",
        textAlign: "center",
      }}
    >
      <motion.div variants={container} initial="hidden" animate="show" style={{ position: "relative", zIndex: 1 }}>
        <motion.div
          variants={item}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
            borderRadius: 999,
            padding: "5px 14px",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            marginBottom: 24,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--signal-low)" }} />
          Strictly defense-only · built for AI Risk Manager track
        </motion.div>

        <motion.h1
          variants={item}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 700,
            lineHeight: 1.15,
            margin: "0 0 20px",
            letterSpacing: "-0.01em",
          }}
        >
          Stop losing margin to{" "}
          <span style={{ color: "var(--accent)" }}>fraud, returns,</span> and chargebacks.
        </motion.h1>

        <motion.p
          variants={item}
          style={{
            fontSize: 16,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            maxWidth: 560,
            margin: "0 auto 36px",
          }}
        >
          A working risk console for BFSI and e-commerce merchants — dual-model
          chargeback and return-risk scoring, auto-compiled evidence, abuse-ring
          and fraud-spike detection with real webhook alerting, and honest
          metrics you can actually defend.
        </motion.p>

        <motion.div variants={item} style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <button
              onClick={onEnterConsole}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--accent)",
                color: "#0b1220",
                borderRadius: "var(--radius-sm)",
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Try the console now <ArrowRight size={16} />
            </button>
          </motion.div>
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            href="#features"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border-hairline-strong)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            See what it does
          </motion.a>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wavy canvas layer — now a page-level background (position: fixed, like
// BackgroundGlow) rather than scoped to the hero section, so it's visible
// behind every section as the page scrolls. Sits directly behind the
// sparkles layer; DOM order (this renders first) plus matching z-index
// means sparkles paint on top of it as a sibling.
// ---------------------------------------------------------------------------
function WavyPageLayer({ reduceMotion }: { reduceMotion: boolean | null }) {
  if (reduceMotion) return null;
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <WavyBackground waveOpacity={0.22} blur={16} speed="slow" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkles layer — also page-level now (position: fixed, full viewport)
// rather than confined to the hero's bounding box. Density is lower than
// the hero-only version since tsParticles scales particle count with
// canvas area, and a full-viewport canvas is substantially larger than a
// single hero block; the vignette is widened accordingly so it only fades
// at the extreme edges instead of hugging a hero-sized box in the middle
// of the page.
// ---------------------------------------------------------------------------
function SparklesPageLayer({ reduceMotion }: { reduceMotion: boolean | null }) {
  if (reduceMotion) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <SparklesCore
        background="transparent"
        minSize={0.4}
        maxSize={1.1}
        particleDensity={90}
        particleColor="#5b8def"
        speed={2}
        className="h-full w-full"
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg-base)",
          WebkitMaskImage: "radial-gradient(100% 100% at 50% 40%, transparent 55%, black 100%)",
          maskImage: "radial-gradient(100% 100% at 50% 40%, transparent 55%, black 100%)",
        }}
      />
    </div>
  );
}

function StatsStrip() {
  return (
    <section style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "0 24px 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {STATS.map((stat, i) =>
          stat.kind === "number" ? (
            <NumberStatCard key={stat.label} {...stat} delay={i * 0.1} />
          ) : (
            <TextStatCard key={stat.label} {...stat} delay={i * 0.1} />
          )
        )}
      </div>
    </section>
  );
}

function NumberStatCard({
  label,
  value,
  decimals,
  suffix = "",
  prefix = "",
  delay,
}: {
  label: string;
  value: number;
  decimals: number;
  suffix?: string;
  prefix?: string;
  delay: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (!inView || reduceMotion) {
      if (reduceMotion) setDisplay(value);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduceMotion, value]);

  return (
    <motion.div
      ref={ref}
      style={{ height: "100%" }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <CardSpotlight className="p-6 text-center h-full" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 600, color: "var(--accent)" }}>
          {prefix}
          {display.toFixed(decimals)}
          {suffix}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{label}</div>
      </CardSpotlight>
    </motion.div>
  );
}

// A methodology stat — no number to count up, just a short claim (e.g.
// "Zero leakage") backed by the caption underneath. Sits alongside the
// numeric stats to signal how the model was validated, not just how it
// scored, since a bare performance number invites "at what tradeoff?"
// without the context to answer it.
function TextStatCard({ label, display, delay }: { label: string; display: string; delay: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      style={{ height: "100%" }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
    >
      <CardSpotlight className="p-6 text-center h-full" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 600, color: "var(--accent)" }}>{display}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{label}</div>
      </CardSpotlight>
    </motion.div>
  );
}

function Features() {
  return (
    <section id="features" style={{ position: "relative", zIndex: 1, maxWidth: 1080, margin: "0 auto", padding: "0 24px 96px" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center", marginBottom: 48 }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 600, margin: "0 0 12px" }}>
          One console, four loss categories solved end to end
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 480, margin: "0 auto" }}>
          Built as a working system, not a slide deck — every feature below is
          live in the console.
        </p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {FEATURES.map((feature, i) => (
          <FeatureCard key={feature.title} {...feature} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  index: number;
}) {
  return (
    <motion.div
      style={{ height: "100%" }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 3) * 0.08 }}
      whileHover={{ y: -3 }}
    >
      <CardSpotlight className="p-6 h-full" style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <Icon size={18} color="var(--accent)" aria-hidden />
        </div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{description}</p>
      </CardSpotlight>
    </motion.div>
  );
}

function ClosingCTA({ onEnterConsole }: { onEnterConsole: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 24px 96px",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, margin: "0 0 12px" }}>
        See the model score a real order
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 28px" }}>
        No sign-up. Jump straight into the dashboard, the scorer, and the
        abuse-ring graph.
      </p>
      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} style={{ display: "inline-block" }}>
        <button
          onClick={onEnterConsole}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--accent)",
            color: "#0b1220",
            borderRadius: "var(--radius-sm)",
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Try now <ArrowRight size={16} />
        </button>
      </motion.div>
    </motion.section>
  );
}

function Footer() {
  return (
    <footer
      style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid var(--border-hairline)",
        padding: "24px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        maxWidth: 1200,
        margin: "0 auto",
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      <span>Fraud Risk Manager — a submission for the AI Risk Manager track</span>
      <a href="https://github.com/aaryanpawar16/fraud-risk-manager" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        <Github size={14} /> Source
      </a>
    </footer>
  );
}
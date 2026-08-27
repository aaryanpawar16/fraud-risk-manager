# Fraud Risk Manager — Frontend

React + TypeScript + Vite console for the AI Risk Manager track:
dual-model chargeback and return-risk scoring, abuse-ring and
fraud-spike detection with real webhook alerting, batch CSV scoring,
and chargeback evidence generation for e-commerce merchants.

## Setup

```bash
npm install
cp .env.example .env
# edit .env to point VITE_API_BASE_URL at your running FastAPI backend
npm run dev
```

Runs at `http://localhost:5173` by default. Visiting `/` shows the
landing page; the console itself lives at `/app`. The backend
(`../backend`) must be running for any console page to show real data —
every page has a real loading/error/empty state rather than mock
fallbacks, so with no backend running you'll correctly see connection
errors, not silent blank pages.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then produce a production build in `dist/` |
| `npm run typecheck` | Type-check only, no build output |

## Project structure

```
src/
├── App.tsx                  Router — landing page at "/", console at "/app/*".
│                             Also hosts the secure-access transition overlay
│                             as a sibling of <Routes>, not nested inside
│                             Landing — living here lets it survive the route
│                             change to /app instead of unmounting with it.
├── main.tsx                 Entrypoint — mounts App inside ErrorBoundary
├── vite-env.d.ts             Vite env var type declarations
│
├── pages/
│   ├── Landing.tsx           Marketing page — hero, stats, 12-card feature grid
│   ├── Dashboard.tsx         Both models' metrics, cost curve, drift, ROC curve,
│   │                         confusion matrix, policy simulator, baseline comparison
│   ├── ScoreOrder.tsx        Manual order scoring — shows both risk scores side by side
│   ├── BatchUpload.tsx       CSV upload → bulk scoring → downloadable results
│   ├── ReviewQueue.tsx       Human-in-the-loop queue + resolved-case audit trail,
│   │                         with a bell icon on any case that fired a real webhook alert
│   ├── AbuseGraph.tsx        Shared-identity network graph, severity-sorted, with
│   │                         full ring member lists and connection-type disclosure
│   ├── FraudSpikes.tsx       Weekly chargeback-rate anomaly chart + live alert-status banner
│   ├── Evidence.tsx          Chargeback evidence packet generator — 7 sections including
│   │                         a live model re-score and a real abuse-ring network check
│   └── NotFound.tsx          404 fallback
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx      Persistent sidebar nav (console only, not landing)
│   │   ├── ErrorBoundary.tsx Catches render errors so one broken page
│   │   │                     doesn't blank the whole app
│   │   └── PageHeader.tsx    Shared console page header (title + divider)
│   ├── charts/
│   │   ├── CostCurveChart.tsx  Expected-cost-vs-threshold line chart
│   │   ├── DriftChart.tsx      Precision/recall across time slices
│   │   ├── ROCCurveChart.tsx   True/false positive rate curve, computed client-side
│   │   │                       from data already in /metrics — no backend change needed
│   │   ├── ConfusionMatrix.tsx 2x2 breakdown at the cost-optimal threshold
│   │   └── SpikeChart.tsx      Weekly rate + rolling baseline + spike markers
│   ├── risk/
│   │   ├── ScoreCard.tsx       Full risk-assessment card — both models
│   │   ├── ThresholdSlider.tsx Decision-threshold range control
│   │   ├── PolicySimulator.tsx Same slider, reframed as live ₹/month projected savings
│   │   └── FeatureExplanation.tsx  SHAP-style contributing-factor bars
│   ├── graph/
│   │   └── ForceGraph.tsx      Typed wrapper around react-force-graph-2d
│   └── ui/
│       ├── atoms.tsx            Panel, RiskBadge, SignalStrip, StatWithDelta,
│       │                        loading/error/empty states
│       ├── card-spotlight.tsx   Mouse-tracking spotlight + WebGL dot reveal (wraps Panel)
│       ├── canvas-reveal-effect.tsx  The WebGL dot-matrix shader behind card-spotlight
│       ├── circular-progress.tsx  Honest indeterminate loading ring — deliberately
│       │                        not a fake percentage bar (see the file's own comment)
│       ├── sparkles.tsx         Particle-field background (landing page hero)
│       ├── wavy-background.tsx  Animated wave canvas (landing page hero)
│       └── secure-access-transition.tsx  Full-screen "entering the console"
│                               ceremony — closed access card -> two-page
│                               spread -> portal flash -> reveal. Reuses the
│                               same wavy-background/sparkles layers as the
│                               landing page (identical config) rather than
│                               feeling like a disconnected screen
│
├── api/
│   ├── client.ts             Fetch wrappers for every backend endpoint
│   └── types.ts               Types matching the FastAPI Pydantic schemas
│
├── lib/
│   └── utils.ts               Currency/date formatting, cn(), debounce, etc.
│
└── styles/
    ├── tokens.css              CSS variable design tokens (colors, fonts, radius)
    └── globals.css             Tailwind layers, resets, spinner keyframes, and a
                                 hover rule that brightens muted caption text whenever
                                 its card's spotlight effect is active (readability fix)
```

## Design system

Dark "risk console" aesthetic — near-black surfaces (`--bg-base:
#050506`), a single restrained blue (`--accent`) for interactive
elements, and red/amber/green (`--signal-high/medium/low`) reserved
strictly for risk-state signals, never decoration. The sidebar's active
nav highlight uses its own separate `--nav-active` (yellow) variable,
deliberately not `--accent` — changing it doesn't ripple into charts,
buttons, or stat values elsewhere. All values live as CSS variables in
`src/styles/tokens.css`; Tailwind's config maps onto the same variables
so either inline styles or Tailwind utility classes stay visually
consistent.

Fonts: Syne (page titles — bold, deliberately unconventional
proportions so it reads as a considered choice rather than a generic
dashboard default), IBM Plex Sans (UI text), IBM Plex Mono (order IDs,
amounts, scores — anything that needs to be read precisely).

Every `Panel` (used on every console page) is wrapped in `CardSpotlight`
— a mouse-tracking spotlight with a WebGL dot-matrix reveal — applied
uniformly via the shared component rather than per-page.

## Backend contract

Every page expects these FastAPI endpoints (see `src/api/client.ts` and
`src/api/types.ts` for exact shapes):

| Endpoint | Used by |
|---|---|
| `POST /score` | ScoreOrder |
| `POST /score/batch` | BatchUpload |
| `GET /batch-files/{filename}` | BatchUpload (download) |
| `GET /review`, `POST /review/{order_id}` | ReviewQueue |
| `GET /review/resolved` | ReviewQueue (Resolved tab) |
| `GET /metrics` | Dashboard (also drives ROC curve, confusion matrix, and policy simulator — no separate endpoints needed) |
| `GET /graph` | AbuseGraph |
| `GET /fraud-spikes` | FraudSpikes |
| `POST /evidence/{order_id}` | Evidence |
| `GET /evidence-files/{order_id}.pdf` | Evidence (download) |

## Known trade-offs

- **Bundle size: ~1.94MB raw / ~552KB gzipped**, no code-splitting.
  `@react-three/fiber` + `three` (needed for the WebGL card-spotlight
  effect) account for most of this. This was a deliberate, known
  trade-off made when the effect was added, not an oversight. If this
  ships further, route-level `React.lazy()` and lazy-loading the
  spotlight effect only on hover would be the first optimizations.
- Styling is a mix of inline styles (for anything token-driven) and
  Tailwind utilities (available but lightly used). This was a deliberate
  choice to keep the design token system as the single source of truth
  rather than duplicating values into Tailwind's config and then
  overriding them per-component.
- **No automated frontend tests** (no Vitest/Testing Library/Playwright)
  — worth noting this is genuinely different from the rest of the
  project, which has 103 tests across the ML pipeline and backend API.
  Every frontend page and bug fix here was verified by hand instead —
  `tsc --noEmit` + `vite build` on every single change, plus manual
  click-through against a live backend — but there's no regression
  suite that would catch a future change breaking, say, the Evidence
  page's download flow. Worth adding first if this frontend specifically
  goes further.

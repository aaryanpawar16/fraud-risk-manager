# Fraud Risk Manager — AI Risk Manager Track

[![Tests](https://github.com/aaryanpawar16/fraud-risk-manager/actions/workflows/tests.yml/badge.svg)](https://github.com/aaryanpawar16/fraud-risk-manager/actions/workflows/tests.yml)

**Live demo:** https://fraud-risk-manager.vercel.app/ · **API docs:** https://fraud-risk-manager.onrender.com/docs

*(Backend runs on Render's free tier — if it's been idle, the first
request can take 30-60s to cold-start. Give it a moment before
assuming something's broken.)*

A working risk console for BFSI/e-commerce merchants: stop losing
margin to fraud, returns, and chargebacks — built to answer this
track's own bar directly, with **honest metrics including
false-positive cost**, and **strictly defense-only**.

## The four things this actually does

The track names four example directions. This submission builds all
four, live and tested, not just one with the others implied:

| Track direction | What's built |
|---|---|
| **Return-risk scorer** | A genuinely separate model trained on real return outcomes — not the chargeback model's score reused as a proxy. See [`docs/metrics_report.md`](docs/metrics_report.md) for how we caught and fixed an initial version that scored barely above random. |
| **Chargeback evidence responder** | One click compiles delivery proof, device/IP match, and order history into a real, downloadable dispute-response PDF. |
| **Fraud-spike detector** | Rolling z-score anomaly detection on weekly chargeback rate — flags when fraud is trending up across the whole book, not just which single order looks risky. |
| **Abuse-ring sentinel** | NetworkX clustering on shared device/address identifiers within a tight time window, distinguishing coordinated rings from incidental overlap. |

Plus: cost-weighted decisioning (threshold tuned to your actual ₹
false-positive/false-negative costs, not accuracy), a policy simulator
that turns that same cost data into a live ₹-per-month savings number,
drift monitoring, an ROC curve and confusion matrix, batch CSV scoring,
and an honest baseline comparison against a plain logistic regression —
reported as-is, including where the simpler model wins.

**Real webhook alerting, not a mockup.** Both the fraud-spike detector
and the review queue fire an actual HTTP POST to a configurable webhook
(Slack, Discord, ntfy.sh, or any JSON-accepting endpoint) the moment a
genuine spike or high-risk case appears — proven end-to-end against a
real Slack workspace, not just claimed. See
[`backend/README.md`](backend/README.md#alerting) for setup.

## Structure

```
backend/    FastAPI serving both models + all 4 differentiators +
            real webhook alerting. 54 tests of its own.
backend/ml/ Training pipeline: data generation, both models, evaluation,
            49 passing tests. Start here to understand the methodology.
frontend/   React console — landing page + 7-page app.
docs/architecture.md   Full system architecture, with diagrams.
render.yaml, DEPLOYMENT.md   Deploy backend (Render) + frontend (Vercel).
```

Each has its own README with setup details: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md). For how the pieces fit together, see [`docs/architecture.md`](docs/architecture.md).

## Quickstart (local)

```bash
# 0. Clone the repo
git clone https://github.com/aaryanpawar16/fraud-risk-manager.git
cd fraud-risk-manager

# 1. Train both models (skip if ml/artifacts already exist)
cd backend/ml
python generate_synthetic_data.py --n_orders 20000 --seed 42
python train.py
python evaluate.py
python train_return_model.py
python train_baseline_model.py
pytest tests/ -v   # 49 passed

# 2. Backend
cd ../
pip install -r requirements.txt
cp .env.example .env   # optional — add ALERT_WEBHOOK_URL here to enable real alerting
uvicorn app.main:app --reload   # http://localhost:8000, docs at /docs

# 3. Frontend (separate terminal)
cd ../frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL defaults to localhost:8000
npm run dev              # http://localhost:5173
```

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) — backend on Render (needed for
SQLite persistence and file downloads), frontend on Vercel.

## The honest-metrics story, in three numbers

- **ROC-AUC 0.767** on strictly time-split holdout data (chargeback
  model) — not a random shuffle split, which would silently leak future
  fraud patterns into training.
- **Cost-optimal threshold 0.25**, not the accuracy-maximizing one —
  because missing a chargeback costs ~13x more than wrongly flagging a
  good order (₹4,500 vs ₹350 in our stated assumptions), the model
  deliberately favors recall (~85%) over precision (~17%). We explain
  why that's correct rather than hiding it.
- **A plain logistic regression baseline slightly beats our production
  XGBoost model** on this dataset (0.7805 vs 0.7667 ROC-AUC) — reported
  honestly, with the technical reason why, in
  [`backend/ml/docs/metrics_report.md`](backend/ml/docs/metrics_report.md)
  ("Model choice" section), rather than quietly retrained until the
  "right" model won.

## Test coverage

**103 tests total**, across two independent suites:

- **49 tests** in `backend/ml/tests/` — chronological split integrity,
  leakage-column exclusion (in both directions — `returned` excluded
  from the chargeback model, `chargeback` excluded from the return
  model), cost-curve math verified against hand-computed values, drift
  detection, SHAP explanation correctness, and the baseline comparison
  methodology. Run `pytest backend/ml/tests/ -v`.
- **54 tests** in `backend/tests/` — every API route, including a real
  local HTTP server used to prove webhook alerts genuinely fire with
  the correct payload (not mocked), DB-backed dedup, cross-checks
  between independent endpoints (the confusion matrix's raw counts are
  verified to reproduce the same precision/recall shown elsewhere on
  the Dashboard), and full test isolation via a disposable SQLite
  database so running tests never touches your real dev data. Run
  `pytest backend/tests/ -v`.

Both suites run automatically on every push via GitHub Actions — see
the badge at the top of this file.

## What's not covered

Stated plainly, not hidden: no authentication on the API (fine for a
demo, not for production), no automated tests on the frontend itself
(every page was verified by hand — `tsc`/build on every change plus
manual click-through against a live backend, not a Vitest/Playwright
suite), and SQLite persistence is single-instance only. See each
component's README for more detail on known limitations.

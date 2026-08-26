# Risk Manager — Backend

FastAPI backend serving two independently-trained fraud/return-risk
models, chargeback evidence generation, abuse-ring graph detection,
fraud-spike anomaly monitoring, and batch CSV scoring.

## Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Runs at `http://localhost:8000`. Interactive API docs at
`http://localhost:8000/docs`.

**Before running for the first time**, make sure `ml/` (with trained
model artifacts already generated) exists inside `backend/`. If you're
starting from the `ml/` pipeline fresh:

```bash
cd backend/ml
python generate_synthetic_data.py --n_orders 20000 --seed 42
python train.py
python evaluate.py
python train_return_model.py
python train_baseline_model.py
pytest tests/ -v   # should show 49 passed
```

SQLite database and output directories (`app/db/`, `outputs/evidence/`,
`outputs/batch_results/`) are created automatically on first run — no
manual setup needed.

## Environment variables

Copy `.env.example` to `.env` inside `backend/` — it's loaded
automatically on startup (`app/config.py` calls `load_dotenv()`), so
you don't need to manually export anything in your shell.

| Variable | Required? | What it does |
|---|---|---|
| `ALLOWED_ORIGINS` | Production only | Extra CORS origins beyond the always-allowed localhost:5173 dev origin — see `../DEPLOYMENT.md` |
| `ALERT_WEBHOOK_URL` | Optional | Real-time webhook notifications for fraud spikes and high-risk review cases — see [Alerting](#alerting) below |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/` | Health check |
| POST | `/score` | Scores one order through both models (chargeback + return risk) |
| POST | `/score/batch` | Uploads a CSV, scores every row through both models |
| GET | `/batch-files/{filename}` | Downloads a batch scoring result CSV |
| GET | `/review` | Pending review-queue cases |
| POST | `/review/{order_id}` | Approve/block a case |
| GET | `/review/resolved` | Audit trail of resolved cases |
| GET | `/metrics` | Chargeback model metrics, return model summary, baseline comparison |
| GET | `/graph` | Abuse-ring shared-identity graph |
| GET | `/fraud-spikes` | Weekly chargeback-rate anomaly report |
| POST | `/evidence/{order_id}` | Compiles a chargeback evidence packet |
| GET | `/evidence-files/{order_id}.pdf` | Downloads the generated evidence PDF |

## Project structure

```
app/
├── main.py              FastAPI app, CORS, router wiring
├── config.py             Paths, cost constants, risk-band thresholds
├── api/                  One file per route group (see table above)
├── models/
│   ├── schemas.py         Pydantic request/response models
│   └── db_models.py       SQLAlchemy ORM — review_cases, spike_alerts, review_alerts
├── services/              Business logic, one file per concern:
│   ├── scorer.py           Wraps both models' RiskExplainer instances
│   ├── review_store.py     SQLite-backed review queue + audit trail
│   ├── graph_engine.py     NetworkX abuse-ring clustering
│   ├── evidence_builder.py PDF evidence packet generation (composes scorer.py + graph_engine.py)
│   ├── spike_detector.py   Rolling z-score anomaly detection
│   ├── batch_scorer.py     CSV upload → per-row scoring
│   └── alerting.py         Real webhook POSTs for spikes + high-risk cases, DB-backed dedup
└── db/
    ├── database.py         SQLAlchemy engine/session
    └── init_db.py          Table creation on startup

ml/                       The training pipeline — see the root README or
                           the root README for details. This directory
                           must exist with trained artifacts present for
                           the API to function; app/config.py points
                           directly at ml/artifacts/, ml/artifacts_returns/,
                           ml/data/, and ml/reports/.
```

## Two models, not one

`/score` returns risk from **two separately-trained models**:
`artifacts/` (chargeback, trained on the `chargeback` label) and
`artifacts_returns/` (return risk, trained independently on `returned`,
with `chargeback` excluded as a leakage feature). They frequently
disagree on the same order — see [`ml/docs/metrics_report.md`](ml/docs/metrics_report.md)
for a live example. This isn't one model's score reused as a proxy for
the other.

## Alerting

Both the fraud-spike detector and the review queue can fire a real
webhook notification the moment something genuinely worth attention
appears — proven end-to-end against a real Slack workspace, not just
built and assumed to work.

1. Create a Slack **Incoming Webhook**: [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **Blank app** → pick your workspace → **Incoming Webhooks** → activate → **Add New Webhook to Workspace** → choose a channel → copy the URL.
2. Put it in `backend/.env`:
   ```
   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
   ```
3. Restart `uvicorn` — `.env` loads automatically.

**Two independent trigger points, each deduplicated separately** (see
`app/services/alerting.py`):
- **Fraud spikes** — fires once per newly-detected spike week, tracked
  in the `spike_alerts` table. Re-fetching `GET /fraud-spikes` (which
  the Dashboard does on every load) never re-sends the same alert.
- **Review queue** — fires once per high-risk order, the moment it's
  first seeded into the queue, tracked in `review_alerts`. Deliberately
  scoped to "high" band only, not "medium" — medium-risk orders are
  normal review-queue volume, not urgent-ping material.

Payloads include both a `"text"` field (required for Slack's Incoming
Webhook API specifically — omit it and Slack silently rejects the
payload) and richer structured fields (`risk_score`, `order_id`,
`z_score`, etc.) for services that accept arbitrary JSON, like Discord
or ntfy.sh.

To see it fire locally: delete `app/db/risk_manager.db`, restart the
server, then hit `GET /review` (or open the Review Queue page) — this
forces a fresh seed of the deterministic dataset's real high-risk
cases, each one firing a genuine webhook.

## Testing

**103 tests total**, across two independent suites:

- `ml/tests/` (49 tests) — the ML pipeline's split integrity, leakage
  guards, cost-math correctness, and baseline comparison methodology.
  `cd ml && pytest -v`
- `tests/` (54 tests) — every API route, including a real local HTTP
  server used to prove webhook alerts genuinely fire with the correct
  payload (not mocked), DB-backed dedup verified by actually resolving
  cases through a live server and confirming an isolated test database
  never touches the real one, and cross-checks between independent
  endpoints (e.g. the confusion matrix's raw counts are verified to
  reproduce the same precision/recall shown elsewhere). `pytest tests/ -v`

Both suites run on every push via GitHub Actions — see the root
README's badge.

## Known limitations

- **`review_store.py` uses SQLite**, which is fine for a single-instance
  deployment but won't work if you ever run multiple backend instances
  behind a load balancer (each would have its own separate file).
- **No authentication.** Every endpoint is open. Fine for a hackathon
  demo, not fine for anything real.
- **Batch scoring is capped at 5,000 rows** per upload and processes
  synchronously (the request blocks until scoring finishes) — a real
  production version would want a background job queue for large files.

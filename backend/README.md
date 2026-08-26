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

See `.env.example`. The only one that matters is `ALLOWED_ORIGINS`,
and only in production — see `../DEPLOYMENT.md`.

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
│   └── db_models.py       SQLAlchemy ORM model (review_cases table)
├── services/              Business logic, one file per concern:
│   ├── scorer.py           Wraps both models' RiskExplainer instances
│   ├── review_store.py     SQLite-backed review queue + audit trail
│   ├── graph_engine.py     NetworkX abuse-ring clustering
│   ├── evidence_builder.py PDF evidence packet generation
│   ├── spike_detector.py   Rolling z-score anomaly detection
│   └── batch_scorer.py     CSV upload → per-row scoring
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
disagree on the same order — see `ml/docs/metrics_report.md` §7.3 for a
live example. This isn't one model's score reused as a proxy for the
other.

## Testing

All testing lives in `ml/tests/` (49 tests) — the ML pipeline's split
integrity, leakage guards, cost-math correctness, and the baseline
comparison methodology are all covered. The FastAPI layer itself
(`app/api/`, `app/services/`) doesn't currently have its own automated
test suite — it's been verified through extensive manual `curl` testing
against a live server throughout development (including a full
simulated fresh-deploy state with no existing database or output
files), but there's no `pytest` coverage for the API routes themselves.
Worth adding if this goes further.

## Known limitations

- **`review_store.py` uses SQLite**, which is fine for a single-instance
  deployment but won't work if you ever run multiple backend instances
  behind a load balancer (each would have its own separate file).
- **No authentication.** Every endpoint is open. Fine for a hackathon
  demo, not fine for anything real.
- **Batch scoring is capped at 5,000 rows** per upload and processes
  synchronously (the request blocks until scoring finishes) — a real
  production version would want a background job queue for large files.

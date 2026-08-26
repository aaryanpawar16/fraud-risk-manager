# backend/app/config.py
"""
Central paths and constants for the backend.

FP_COST / FN_COST are duplicated from ml/evaluate.py rather than imported,
since ml/ is a standalone scripts directory (no package __init__.py) that
also gets run directly via `python evaluate.py`. If you change the cost
assumptions in evaluate.py, update them here too — a mismatch would mean
the API's risk bands and the offline metrics report disagree on what
"cost-optimal" means.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Loads backend/.env if it exists — this is what makes ALLOWED_ORIGINS,
# ALERT_WEBHOOK_URL, etc. actually work when set via a .env file (the
# natural, expected thing to do), not just via a manually-exported shell
# variable. Uses an explicit path rather than python-dotenv's default
# cwd-based discovery, since uvicorn might get launched from a different
# working directory than backend/ itself. Safe to call even if the file
# doesn't exist — it's a silent no-op, not an error, so this doesn't
# break anyone who's setting env vars a different way (Render's
# dashboard, CI, etc.).
load_dotenv(BACKEND_DIR / ".env")

ML_DIR = BACKEND_DIR / "ml"
ARTIFACTS_DIR = ML_DIR / "artifacts"
RETURN_ARTIFACTS_DIR = ML_DIR / "artifacts_returns"
DATA_DIR = ML_DIR / "data"
REPORTS_DIR = ML_DIR / "reports"
OUTPUTS_DIR = BACKEND_DIR / "outputs"
EVIDENCE_PDF_DIR = OUTPUTS_DIR / "evidence"
BATCH_RESULTS_DIR = OUTPUTS_DIR / "batch_results"
# DB_PATH can be overridden via TEST_DB_PATH — used by the test suite
# (backend/tests/conftest.py) to point at an isolated, disposable SQLite
# file instead of your real dev database, so running tests never mutates
# or reseeds the review queue you're actually using.
DB_PATH = Path(os.environ.get("TEST_DB_PATH", str(BACKEND_DIR / "app" / "db" / "risk_manager.db")))

# Optional — set this to a webhook URL (Slack incoming webhook, Discord,
# ntfy.sh, Zapier/Make catch-hook, or any endpoint that accepts a JSON
# POST) to get a real notification when a new fraud spike is detected.
# Left unset, alerting is simply skipped — /fraud-spikes still works
# normally, it just won't try to notify anyone.
ALERT_WEBHOOK_URL = os.environ.get("ALERT_WEBHOOK_URL", "")

# ml/ has no __init__.py (it's meant to be run as scripts), so we add it to
# sys.path to reuse the already-tested RiskExplainer from ml/explain.py
# instead of duplicating that logic here.
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

# Mirrors ml/evaluate.py's FP_COST / FN_COST exactly.
FALSE_POSITIVE_COST_INR = 350
FALSE_NEGATIVE_COST_INR = 4500

# Risk band boundaries — mirrors frontend/src/lib/utils.ts:bandFromScore
# so the API and the UI never disagree about what counts as "high risk".
BAND_HIGH_THRESHOLD = 0.6
BAND_MEDIUM_THRESHOLD = 0.25

EVIDENCE_PDF_DIR.mkdir(parents=True, exist_ok=True)
BATCH_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

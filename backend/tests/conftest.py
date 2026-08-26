# backend/tests/conftest.py
"""
Sets TEST_DB_PATH to a fresh temp file BEFORE any `app.*` module is
imported, so the whole test session runs against an isolated,
disposable SQLite database — never the real dev database at
app/db/risk_manager.db. This matters because running the test suite
shouldn't reseed, mutate, or pollute the review queue you're actually
using during development or a demo.

The env var has to be set at module import time (not inside a fixture
function), because app.config.DB_PATH is read once, at import time, and
app.db.database creates its SQLAlchemy engine from that value
immediately. By the time a fixture function runs, it would already be
too late.
"""

import os
import sys
import tempfile
from pathlib import Path

_TEST_DB_DIR = tempfile.mkdtemp(prefix="risk_manager_test_")
os.environ["TEST_DB_PATH"] = str(Path(_TEST_DB_DIR) / "test_risk_manager.db")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.db.init_db import init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _init_test_db():
    """Creates tables in the isolated test DB once per test session —
    normally main.py's startup event does this, but TestClient's
    startup event handling can be inconsistent across FastAPI versions,
    so we call it explicitly here to be certain."""
    init_db()


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

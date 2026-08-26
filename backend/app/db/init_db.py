# backend/app/db/init_db.py
"""
Creates all tables declared via SQLAlchemy's Base if they don't already
exist. Called once at app startup (see main.py's startup event) — safe
to call every time the process starts, since create_all is a no-op for
tables that already exist.
"""

from app.db.database import Base, engine
from app.models import db_models  # noqa: F401 — import registers the model with Base.metadata


def init_db() -> None:
    Base.metadata.create_all(bind=engine)

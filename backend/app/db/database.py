# backend/app/db/database.py
"""
SQLAlchemy engine/session setup. SQLite for now — simple, zero-config,
file-based, which fits a hackathon deployment target far better than
standing up Postgres. Swapping to Postgres later only means changing
DATABASE_URL; nothing else in db/ or services/ would need to change,
since everything goes through SQLAlchemy's ORM rather than raw SQL.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DB_PATH

DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False is required for SQLite specifically — FastAPI
# may serve a request on a different thread than the one that created the
# connection. Our access pattern (short-lived session per function call,
# not held across await points) makes this safe.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_session() -> Session:
    """Not used as a FastAPI Depends() — the existing service-layer
    functions (review_store.py) open and close their own short-lived
    sessions, matching the pattern the routes already used with the
    in-memory store. Exposed here in case a future route wants proper
    dependency-injected sessions instead."""
    return SessionLocal()

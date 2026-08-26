# backend/app/models/db_models.py
"""
SQLAlchemy ORM models. Kept separate from models/schemas.py (the Pydantic
API models) deliberately — the DB row shape and the API response shape
are allowed to diverge (e.g. resolved_at only makes sense as a DB
concept), and conflating them tends to leak storage details into the API
contract.
"""

from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ReviewCaseRow(Base):
    __tablename__ = "review_cases"

    order_id: Mapped[str] = mapped_column(String, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String, nullable=False)
    order_value: Mapped[float] = mapped_column(Float, nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_band: Mapped[str] = mapped_column(String, nullable=False)
    top_reason_label: Mapped[str] = mapped_column(String, nullable=False)
    flagged_at: Mapped[str] = mapped_column(String, nullable=False)  # ISO timestamp
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # Only set once resolve() is called — None for still-pending cases.
    # This is the field that makes an audit trail possible: "what did we
    # decide, and when" rather than just "what's the current status".
    resolved_at: Mapped[str] = mapped_column(String, nullable=True)


class SpikeAlertRow(Base):
    """
    Tracks which fraud-spike weeks have already triggered a webhook
    notification, keyed by the week's period_start. Without this, calling
    GET /fraud-spikes (which the Dashboard does on every page load) would
    re-fire the same alert every single time a spike week is still the
    most recent one — this table is what makes it "notify once when a
    NEW spike appears," not "spam on every refresh."
    """

    __tablename__ = "spike_alerts"

    period_start: Mapped[str] = mapped_column(String, primary_key=True)
    alerted_at: Mapped[str] = mapped_column(String, nullable=False)
    webhook_status_code: Mapped[int] = mapped_column(nullable=True)


class ReviewAlertRow(Base):
    """
    Tracks which high-risk review cases have already triggered a webhook
    notification, keyed by order_id. Reuses the same webhook mechanism as
    SpikeAlertRow/alerting.py — deliberately scoped to "high" band cases
    only (not "medium"), matching realistic ops practice: medium-risk
    cases go to the queue for whenever someone gets to them, but a
    genuinely high-risk case is worth an active ping, not just a row in
    a list someone might not check today.
    """

    __tablename__ = "review_alerts"

    order_id: Mapped[str] = mapped_column(String, primary_key=True)
    alerted_at: Mapped[str] = mapped_column(String, nullable=False)
    webhook_status_code: Mapped[int] = mapped_column(nullable=True)

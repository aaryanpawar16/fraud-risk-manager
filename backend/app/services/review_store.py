# backend/app/services/review_store.py
"""
SQLite-backed review queue. Replaces the earlier in-memory version —
same public function names (get_pending, resolve) so app/api/review_queue.py
barely had to change, plus a new get_resolved() for the audit trail that
the in-memory version had no way to offer (it was gone the moment the
server restarted).

Seed data still comes from real holdout orders run through the actual
trained model (not hand-typed fixtures), filtered to medium/high risk
band so the queue looks like a real triage backlog. Seeding only runs
once — on an empty table — so restarting the server no longer wipes or
regenerates decisions that were already made.
"""

import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import pandas as pd
from sqlalchemy import select

from app.config import DATA_DIR
from app.db.database import SessionLocal
from app.models.db_models import ReviewAlertRow, ReviewCaseRow
from app.models.schemas import ReviewCase
from app.services.alerting import maybe_send_review_alert
from app.services.scorer import band_from_score, get_explainer


def _row_to_schema(row: ReviewCaseRow, alerted_order_ids: set) -> ReviewCase:
    return ReviewCase(
        order_id=row.order_id,
        customer_id=row.customer_id,
        order_value=row.order_value,
        risk_score=row.risk_score,
        risk_band=row.risk_band,  # type: ignore[arg-type]
        top_reason_label=row.top_reason_label,
        flagged_at=row.flagged_at,
        status=row.status,  # type: ignore[arg-type]
        resolved_at=row.resolved_at,
        alert_sent=row.order_id in alerted_order_ids,
    )


def _get_alerted_order_ids(db) -> set:
    """One query for whichever order_ids have a real ReviewAlertRow,
    rather than a per-row lookup inside a loop (N+1 queries) — the
    queue is small (dozens of rows), but there's no reason to write it
    the slow way."""
    return {r for (r,) in db.execute(select(ReviewAlertRow.order_id)).all()}


def _seed_if_empty(limit: int = 24) -> None:
    with SessionLocal() as db:
        existing = db.execute(select(ReviewCaseRow.order_id).limit(1)).first()
        if existing is not None:
            return  # already seeded (possibly with resolved decisions in it) — never overwrite

        holdout_path = Path(DATA_DIR) / "test_holdout.csv"
        df = pd.read_csv(holdout_path, parse_dates=["timestamp"])

        explainer = get_explainer()
        rng = random.Random(7)
        sample = df.sample(n=min(limit * 4, len(df)), random_state=7)

        now = datetime.utcnow()
        seeded = 0

        for _, order_row in sample.iterrows():
            order_features = {
                "account_age_days": int(order_row["account_age_days"]),
                "is_new_account": bool(order_row["is_new_account"]),
                "order_value": float(order_row["order_value"]),
                "item_category": order_row["item_category"],
                "payment_method": order_row["payment_method"],
                "discount_pct": float(order_row["discount_pct"]),
                "shipping_billing_mismatch": bool(order_row["shipping_billing_mismatch"]),
                "ip_country_mismatch": bool(order_row["ip_country_mismatch"]),
                "device_reuse_signal": bool(order_row["device_reuse_signal"]),
                "num_previous_orders": int(order_row["num_previous_orders"]),
                "num_previous_returns": int(order_row["num_previous_returns"]),
                "num_previous_chargebacks": int(order_row["num_previous_chargebacks"]),
            }
            result = explainer.explain_order(order_features, top_n=1)
            band = band_from_score(result["risk_score"])
            if band == "low":
                continue  # queue only holds cases actually worth a human's time

            top_reason_label = result["top_reasons"][0]["label"] if result["top_reasons"] else "No single dominant factor"
            flagged_at = now - timedelta(hours=rng.randint(1, 96))

            db.add(
                ReviewCaseRow(
                    order_id=str(order_row["order_id"]),
                    customer_id=str(order_row["customer_id"]),
                    order_value=float(order_row["order_value"]),
                    risk_score=result["risk_score"],
                    risk_band=band,
                    top_reason_label=top_reason_label,
                    flagged_at=flagged_at.isoformat(),
                    status="pending",
                    resolved_at=None,
                )
            )
            seeded += 1

            # Real-time-equivalent alerting for a batch seed: a genuinely
            # high-risk case entering the queue is worth an active ping,
            # not just another row someone might not check today. Scoped
            # to "high" band only (see ReviewAlertRow's docstring) and
            # deduplicated by order_id, so re-seeding never re-fires —
            # not that re-seeding happens anyway, since _seed_if_empty
            # only ever runs once on a genuinely empty table.
            if band == "high":
                maybe_send_review_alert(
                    order_id=str(order_row["order_id"]),
                    customer_id=str(order_row["customer_id"]),
                    order_value=float(order_row["order_value"]),
                    risk_score=result["risk_score"],
                    top_reason_label=top_reason_label,
                )

            if seeded >= limit:
                break

        db.commit()


def get_pending() -> List[ReviewCase]:
    _seed_if_empty()
    with SessionLocal() as db:
        rows = db.execute(
            select(ReviewCaseRow).where(ReviewCaseRow.status == "pending").order_by(ReviewCaseRow.risk_score.desc())
        ).scalars().all()
        alerted = _get_alerted_order_ids(db)
        return [_row_to_schema(r, alerted) for r in rows]


def get_resolved(limit: int = 100) -> List[ReviewCase]:
    """The audit trail: every case that's been approved or blocked,
    most-recently-resolved first. This is what makes Option B different
    from the in-memory version — these rows survive a server restart."""
    _seed_if_empty()
    with SessionLocal() as db:
        rows = db.execute(
            select(ReviewCaseRow)
            .where(ReviewCaseRow.status != "pending")
            .order_by(ReviewCaseRow.resolved_at.desc())
            .limit(limit)
        ).scalars().all()
        alerted = _get_alerted_order_ids(db)
        return [_row_to_schema(r, alerted) for r in rows]


def resolve(order_id: str, status: str) -> Optional[ReviewCase]:
    with SessionLocal() as db:
        row = db.get(ReviewCaseRow, order_id)
        if row is None:
            return None
        row.status = status
        row.resolved_at = datetime.utcnow().isoformat()
        db.commit()
        db.refresh(row)
        alerted = _get_alerted_order_ids(db)
        return _row_to_schema(row, alerted)

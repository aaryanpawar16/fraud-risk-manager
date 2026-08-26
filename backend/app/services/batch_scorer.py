# backend/app/services/batch_scorer.py
"""
Scores an uploaded CSV of orders through both models at once. Reuses
scorer.score_order() per row rather than reimplementing scoring — this
service's only job is orchestration: parse the upload, validate/coerce
each row into an OrderInput, handle per-row failures without failing the
whole batch, and write an annotated CSV a merchant can download.

A single malformed row (missing column, bad type) doesn't abort the
batch — it's recorded with an error message in that row's result and
scoring continues. A merchant running this on real, messy data will hit
malformed rows; failing the entire upload over one bad row would make
this unusable in practice.
"""

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from uuid import uuid4

import pandas as pd
from pydantic import ValidationError

from app.config import BATCH_RESULTS_DIR
from app.models.schemas import BatchScoreRow, BatchScoreSummary, OrderInput
from app.services.scorer import score_order

REQUIRED_COLUMNS = [
    "account_age_days", "is_new_account", "order_value", "item_category",
    "payment_method", "discount_pct", "shipping_billing_mismatch",
    "ip_country_mismatch", "device_reuse_signal", "num_previous_orders",
    "num_previous_returns", "num_previous_chargebacks",
]

MAX_ROWS = 5000  # keeps a single upload from blocking the server for minutes
PREVIEW_ROWS = 100  # how many scored rows come back inline vs. CSV-only


def _coerce_bool(value) -> bool:
    """CSV values arrive as strings/numbers, not Python bools — normalize
    the common spellings a merchant's export might actually contain."""
    if isinstance(value, bool):
        return value
    if pd.isna(value):
        return False
    s = str(value).strip().lower()
    return s in ("1", "true", "yes", "y", "t")


def score_batch(file_bytes: bytes, original_filename: str) -> BatchScoreSummary:
    try:
        df = pd.read_csv(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Couldn't parse this as a CSV: {exc}") from exc

    if df.empty:
        raise ValueError("The uploaded CSV has no rows.")

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing required column(s): {', '.join(missing)}. "
            f"Expected columns: {', '.join(REQUIRED_COLUMNS)} (plus optional 'order_id')."
        )

    if len(df) > MAX_ROWS:
        raise ValueError(f"This file has {len(df):,} rows — batch scoring is capped at {MAX_ROWS:,} per upload.")

    results: List[BatchScoreRow] = []
    output_rows: List[dict] = []

    high = medium = low = high_return = 0
    scored = failed = 0

    for i, row in df.iterrows():
        row_number = int(i) + 1
        order_id = str(row["order_id"]) if "order_id" in df.columns and pd.notna(row.get("order_id")) else None

        try:
            order = OrderInput(
                order_id=order_id,
                account_age_days=int(row["account_age_days"]),
                is_new_account=_coerce_bool(row["is_new_account"]),
                order_value=float(row["order_value"]),
                item_category=str(row["item_category"]),
                payment_method=str(row["payment_method"]),
                discount_pct=float(row["discount_pct"]),
                shipping_billing_mismatch=_coerce_bool(row["shipping_billing_mismatch"]),
                ip_country_mismatch=_coerce_bool(row["ip_country_mismatch"]),
                device_reuse_signal=_coerce_bool(row["device_reuse_signal"]),
                num_previous_orders=int(row["num_previous_orders"]),
                num_previous_returns=int(row["num_previous_returns"]),
                num_previous_chargebacks=int(row["num_previous_chargebacks"]),
            )
            result = score_order(order)

            if result.risk_band == "high":
                high += 1
            elif result.risk_band == "medium":
                medium += 1
            else:
                low += 1
            if result.return_risk.risk_band == "high":
                high_return += 1
            scored += 1

            results.append(
                BatchScoreRow(
                    row_number=row_number,
                    order_id=order_id,
                    risk_score=round(result.risk_score, 4),
                    risk_band=result.risk_band,
                    recommended_action=result.recommended_action,
                    return_risk_score=round(result.return_risk.risk_score, 4),
                    return_risk_band=result.return_risk.risk_band,
                )
            )
            output_rows.append(
                {
                    **row.to_dict(),
                    "chargeback_risk_score": round(result.risk_score, 4),
                    "chargeback_risk_band": result.risk_band,
                    "recommended_action": result.recommended_action,
                    "return_risk_score": round(result.return_risk.risk_score, 4),
                    "return_risk_band": result.return_risk.risk_band,
                    "scoring_error": "",
                }
            )
        except (ValidationError, ValueError, TypeError, KeyError) as exc:
            failed += 1
            error_msg = str(exc)[:200]
            results.append(BatchScoreRow(row_number=row_number, order_id=order_id, error=error_msg))
            output_rows.append({**row.to_dict(), "scoring_error": error_msg})

    result_filename = f"{Path(original_filename).stem}_scored_{uuid4().hex[:8]}.csv"
    result_path = BATCH_RESULTS_DIR / result_filename
    pd.DataFrame(output_rows).to_csv(result_path, index=False)

    return BatchScoreSummary(
        total_rows=len(df),
        scored_rows=scored,
        failed_rows=failed,
        high_risk_count=high,
        medium_risk_count=medium,
        low_risk_count=low,
        high_return_risk_count=high_return,
        generated_at=datetime.now(timezone.utc).isoformat(),
        csv_url=f"/batch-files/{result_filename}",
        preview_rows=results[:PREVIEW_ROWS],
    )

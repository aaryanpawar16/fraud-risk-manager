# backend/app/api/metrics.py
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.config import REPORTS_DIR, RETURN_ARTIFACTS_DIR
from app.models.schemas import BaselineComparison, MetricsReport, ReturnModelSummary

router = APIRouter(tags=["metrics"])


@lru_cache(maxsize=1)
def _load_report() -> dict:
    """
    Cached for the process lifetime — metrics_report.json only changes
    when someone re-runs ml/evaluate.py, which happens offline, not per
    request. Restart the server to pick up a freshly regenerated report.
    """
    report_path = Path(REPORTS_DIR) / "metrics_report.json"
    if not report_path.exists():
        raise FileNotFoundError(
            f"{report_path} not found — run `python evaluate.py` inside ml/ first "
            "to generate the metrics report this endpoint serves."
        )
    with open(report_path) as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_return_model_summary() -> Optional[ReturnModelSummary]:
    """
    Optional — the return model's own training metadata. Returns None
    (not an error) if train_return_model.py hasn't been run yet, so the
    Dashboard can render normally with just the chargeback model's
    numbers until the second model exists.
    """
    meta_path = RETURN_ARTIFACTS_DIR / "train_holdout_meta.json"
    if not meta_path.exists():
        return None
    with open(meta_path) as f:
        meta = json.load(f)
    return ReturnModelSummary(
        holdout_rows=meta["holdout_rows"],
        holdout_positive_rate=meta["holdout_positive_rate"],
        roc_auc=meta["roc_auc"],
        average_precision=meta["average_precision"],
        band_thresholds=meta["band_thresholds"],
    )


@lru_cache(maxsize=1)
def _load_baseline_comparison() -> Optional[BaselineComparison]:
    """Optional — returns None (not an error) if train_baseline_model.py
    hasn't been run yet."""
    comparison_path = Path(REPORTS_DIR) / "baseline_comparison.json"
    if not comparison_path.exists():
        return None
    with open(comparison_path) as f:
        raw = json.load(f)
    return BaselineComparison(**raw)


@router.get("/metrics", response_model=MetricsReport)
def get_metrics() -> MetricsReport:
    """
    Serves the actual evaluation report produced by ml/evaluate.py against
    the strictly time-split holdout set — not recomputed per request, and
    not synthesized here. If this file is missing, that's a real signal
    the model hasn't been evaluated yet, not something to paper over with
    fake numbers. Also attaches the return-risk model's headline stats
    and the XGBoost-vs-logistic-regression baseline comparison, if
    trained, so the Dashboard reflects the full system, not just the
    chargeback model in isolation.
    """
    try:
        raw = _load_report()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    report = MetricsReport(**raw)
    report.return_model = _load_return_model_summary()
    report.baseline_comparison = _load_baseline_comparison()
    return report

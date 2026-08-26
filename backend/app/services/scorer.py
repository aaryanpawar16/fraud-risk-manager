# backend/app/services/scorer.py
"""
Thin wrapper around ml/explain.py's RiskExplainer. Deliberately does not
reimplement scoring or SHAP-explanation logic — that's already built and
covered by ml/tests/test_explainer.py, so this module's only job is to:
  1. own singleton instances of both loaded models (loading them per-
     request would be slow and pointless — neither changes between
     requests)
  2. translate a raw risk_score into the same risk_band / recommended
     action boundaries the frontend uses, so the two never disagree
  3. run both the chargeback model AND the return-risk model on the same
     order, since they're genuinely separate models (see
     train_return_model.py) trained on different labels, not one model's
     output reused as a proxy for the other
"""

import json

from app.config import ARTIFACTS_DIR, BAND_HIGH_THRESHOLD, BAND_MEDIUM_THRESHOLD, RETURN_ARTIFACTS_DIR
from app.models.schemas import FeatureReason, OrderInput, ReturnRiskResult, RiskBand, ScoreResult

from explain import RiskExplainer  # noqa: E402  (ml/ added to sys.path in app.config)

_explainer: RiskExplainer | None = None
_return_explainer: RiskExplainer | None = None
_return_bands: dict | None = None


def get_explainer() -> RiskExplainer:
    """Lazy singleton for the chargeback model."""
    global _explainer
    if _explainer is None:
        _explainer = RiskExplainer(artifacts_dir=str(ARTIFACTS_DIR))
    return _explainer


def get_return_explainer() -> RiskExplainer:
    """Lazy singleton for the return-risk model — a genuinely separate
    model (see train_return_model.py), not the chargeback model's output
    reinterpreted."""
    global _return_explainer
    if _return_explainer is None:
        _return_explainer = RiskExplainer(artifacts_dir=str(RETURN_ARTIFACTS_DIR))
    return _return_explainer


def _get_return_bands() -> dict:
    """The return model's band thresholds are empirically derived from
    its own holdout score distribution (see train_return_model.py) rather
    than reusing the chargeback model's fixed 0.25/0.6 — the two models
    have structurally different base rates and output distributions, so
    sharing thresholds would misclassify most return-risk scores as at
    least "medium". Loaded from the training run's own metadata rather
    than hardcoded, so it can't silently drift out of sync with whatever
    model is actually deployed."""
    global _return_bands
    if _return_bands is None:
        with open(RETURN_ARTIFACTS_DIR / "train_holdout_meta.json") as f:
            meta = json.load(f)
        _return_bands = meta["band_thresholds"]
    return _return_bands


def band_from_score(score: float) -> RiskBand:
    if score >= BAND_HIGH_THRESHOLD:
        return "high"
    if score >= BAND_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def return_band_from_score(score: float) -> RiskBand:
    bands = _get_return_bands()
    if score >= bands["high"]:
        return "high"
    if score >= bands["medium"]:
        return "medium"
    return "low"


def action_from_band(band: RiskBand) -> str:
    return {"low": "approve", "medium": "review", "high": "block"}[band]


def score_order(order: OrderInput) -> ScoreResult:
    explainer = get_explainer()
    return_explainer = get_return_explainer()

    # RiskExplainer expects a flat dict of raw feature values, matching the
    # column names used at training time. Both models share the same raw
    # order_features input — each one's own feature_columns.json decides
    # which of these it actually uses (e.g. the return model never sees
    # `chargeback` as a feature, same leakage guard as train_return_model.py).
    order_features = order.model_dump(exclude={"order_id"})

    result = explainer.explain_order(order_features, top_n=3)
    band = band_from_score(result["risk_score"])

    return_result = return_explainer.explain_order(order_features, top_n=3)
    return_band = return_band_from_score(return_result["risk_score"])

    return ScoreResult(
        order_id=order.order_id or "UNSCORED-ORDER",
        risk_score=result["risk_score"],
        risk_band=band,
        top_reasons=[FeatureReason(**reason) for reason in result["top_reasons"]],
        recommended_action=action_from_band(band),
        return_risk=ReturnRiskResult(
            risk_score=return_result["risk_score"],
            risk_band=return_band,
            top_reasons=[FeatureReason(**reason) for reason in return_result["top_reasons"]],
        ),
    )

# backend/app/api/score.py
from fastapi import APIRouter, HTTPException

from app.models.schemas import OrderInput, ScoreResult
from app.services.scorer import score_order

router = APIRouter(tags=["score"])


@router.post("/score", response_model=ScoreResult)
def score(order: OrderInput) -> ScoreResult:
    """
    Scores a single order through the trained XGBoost model, returning a
    risk score, band, and the top SHAP-backed contributing factors.

    This calls the real model artifact (ml/artifacts/model.pkl) — not a
    mock — via app.services.scorer, which wraps the same RiskExplainer
    class covered by ml/tests/test_explainer.py.
    """
    try:
        return score_order(order)
    except Exception as exc:  # noqa: BLE001 — surface a clean 500 instead of a raw traceback
        raise HTTPException(status_code=500, detail=f"Scoring failed: {exc}") from exc

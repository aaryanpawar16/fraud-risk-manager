# backend/app/api/review_queue.py
from typing import List

from fastapi import APIRouter, HTTPException

from app.models.schemas import ReviewCase, ReviewResolveRequest
from app.services import review_store

router = APIRouter(tags=["review"])


@router.get("/review", response_model=List[ReviewCase])
def list_review_queue() -> List[ReviewCase]:
    """
    Returns the current review queue. Seeded (on first call, only when the
    table is empty) from real holdout orders scored through the model and
    filtered to medium/high risk band.
    """
    return review_store.get_pending()


@router.get("/review/resolved", response_model=List[ReviewCase])
def list_resolved_cases() -> List[ReviewCase]:
    """
    The audit trail: every case that's been approved or blocked, most
    recently resolved first. Backed by SQLite (app/db/risk_manager.db),
    so — unlike the earlier in-memory version of this store — these
    persist across server restarts.
    """
    return review_store.get_resolved()


@router.post("/review/{order_id}", response_model=ReviewCase)
def resolve_review_case(order_id: str, body: ReviewResolveRequest) -> ReviewCase:
    updated = review_store.resolve(order_id, body.status)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"No pending review case found for order {order_id}")
    return updated

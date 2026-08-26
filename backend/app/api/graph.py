# backend/app/api/graph.py
from fastapi import APIRouter, HTTPException

from app.models.schemas import AbuseGraphData
from app.services.graph_engine import build_graph

router = APIRouter(tags=["graph"])


@router.get("/graph", response_model=AbuseGraphData)
def get_abuse_graph() -> AbuseGraphData:
    """
    Returns the shared-identity network: customers connected via a device
    or shipping address they have in common with another customer. Built
    with NetworkX connected-component clustering over the real train +
    holdout data — see app.services.graph_engine for the algorithm.
    """
    try:
        return build_graph()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Graph build failed: {exc}") from exc

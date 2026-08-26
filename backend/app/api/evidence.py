# backend/app/api/evidence.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import EVIDENCE_PDF_DIR
from app.models.schemas import EvidencePacket
from app.services.evidence_builder import generate_evidence

router = APIRouter(tags=["evidence"])


@router.post("/evidence/{order_id}", response_model=EvidencePacket)
def create_evidence_packet(order_id: str) -> EvidencePacket:
    """
    Compiles a chargeback dispute evidence packet for a real order looked
    up from the train/holdout data, and renders it to an actual
    downloadable PDF, served via the GET route below.

    404s on an order_id that doesn't exist in the dataset — this endpoint
    only works against orders the system actually knows about, same as a
    real merchant's order lookup would.
    """
    packet = generate_evidence(order_id)
    if packet is None:
        raise HTTPException(status_code=404, detail=f"No order found with id {order_id}")
    return packet


@router.get("/evidence-files/{order_id}.pdf")
def download_evidence_pdf(order_id: str) -> FileResponse:
    """
    Serves the generated PDF with an explicit Content-Disposition:
    attachment header, so the browser forces a download regardless of
    origin. This matters specifically because the frontend (:5173) and
    this API (:8000) are different origins in dev — the HTML anchor
    `download` attribute is silently IGNORED by browsers for cross-origin
    links, which is why a generic static-file mount (no explicit
    disposition header) opened the PDF inline instead of downloading it.
    Content-Disposition, unlike the anchor attribute, is respected
    regardless of origin.
    """
    pdf_path = EVIDENCE_PDF_DIR / f"{order_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No evidence PDF found for order {order_id}. Generate it first via POST /evidence/{order_id}.",
        )
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=f"{order_id}.pdf",  # Starlette sets Content-Disposition: attachment from this
    )
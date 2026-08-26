# backend/app/api/batch.py
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import BATCH_RESULTS_DIR
from app.models.schemas import BatchScoreSummary
from app.services.batch_scorer import score_batch

router = APIRouter(tags=["batch"])


@router.post("/score/batch", response_model=BatchScoreSummary)
async def score_batch_upload(file: UploadFile = File(...)) -> BatchScoreSummary:
    """
    Scores every row in an uploaded CSV through both models. A merchant's
    daily order export goes in; a risk-annotated CSV comes back,
    downloadable via the csv_url in the response. Individual malformed
    rows are reported per-row rather than failing the whole upload — see
    batch_scorer.py.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    file_bytes = await file.read()
    try:
        return score_batch(file_bytes, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Batch scoring failed: {exc}") from exc


def _safe_filename(filename: str) -> str:
    """Server generates these filenames (uuid-suffixed), but guard against
    path traversal regardless of how the value reaches this function."""
    name = Path(filename).name  # strips any directory components
    if name != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    return name


@router.get("/batch-files/{filename}")
def download_batch_results(filename: str) -> FileResponse:
    """
    Serves the annotated results CSV with an explicit Content-Disposition
    header — same fix as the evidence PDF route. A generic static mount
    would serve this inline instead of downloading, and a CSV opened
    inline just dumps raw text into the browser tab.
    """
    safe_name = _safe_filename(filename)
    file_path = BATCH_RESULTS_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"No batch result file named {filename}")

    return FileResponse(path=str(file_path), media_type="text/csv", filename=safe_name)

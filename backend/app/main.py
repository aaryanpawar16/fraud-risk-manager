# backend/app/main.py
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import evidence, graph, metrics, review_queue, score, spikes, batch
from app.db.init_db import init_db

app = FastAPI(
    title="Risk Manager API",
    description="Return-risk scoring, chargeback evidence, and abuse-ring detection for e-commerce merchants.",
    version="0.1.0",
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


# Local dev origins are always allowed. Production frontend origin(s) come
# from the ALLOWED_ORIGINS env var (comma-separated) so this doesn't need
# a code change + redeploy every time the frontend's URL changes — set it
# on Render to your Vercel deployment's URL, e.g.
# ALLOWED_ORIGINS=https://your-app.vercel.app
_dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_prod_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins + _prod_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(score.router)
app.include_router(review_queue.router)
app.include_router(metrics.router)
app.include_router(graph.router)
app.include_router(evidence.router)
app.include_router(spikes.router)
app.include_router(batch.router)

# Evidence PDFs are served via the explicit GET /evidence-files/{order_id}.pdf
# route in app/api/evidence.py (with a Content-Disposition: attachment
# header), not a generic StaticFiles mount — a plain static mount serves
# files inline with no disposition header, which is exactly what caused
# the PDF to open in-browser instead of downloading.


@app.get("/", tags=["health"])
def health_check():
    return {"status": "ok", "service": "risk-manager-api"}

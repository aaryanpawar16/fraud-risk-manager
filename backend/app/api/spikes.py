# backend/app/api/spikes.py
from fastapi import APIRouter, HTTPException

import app.config as config
from app.models.schemas import FraudSpikeReport
from app.services.alerting import maybe_send_spike_alert
from app.services.spike_detector import build_spike_report

router = APIRouter(tags=["spikes"])


@router.get("/fraud-spikes", response_model=FraudSpikeReport)
def get_fraud_spikes() -> FraudSpikeReport:
    """
    Weekly chargeback rate with a trailing rolling z-score anomaly flag on
    each point. A different signal from /score (one order) and /graph
    (identity clustering) — this one watches the aggregate rate over time,
    the way a fraud-ops dashboard would, and flags weeks that deviate
    sharply from their own recent baseline.

    Also fires a real webhook notification (see services/alerting.py) if
    the most recent week is a newly-detected spike — turns this from a
    chart you have to remember to check into something that actually
    tells you.
    """
    try:
        report = build_spike_report()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Spike detection failed: {exc}") from exc

    report.alert_configured = bool(config.ALERT_WEBHOOK_URL)
    report.alert_sent_for_current_spike = maybe_send_spike_alert(report.latest_period, report.z_score_threshold)
    return report

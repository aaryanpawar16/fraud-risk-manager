# backend/app/services/alerting.py
"""
Turns two "you'd have to remember to check" surfaces — the fraud-spike
detector and the review queue — into things that actually push a
notification. Deliberately built as a plain webhook POST (not a
Slack/email SDK) — that single mechanism works with Slack incoming
webhooks, Discord, ntfy.sh, Zapier and Make.com catch-hooks, or
literally any endpoint that accepts JSON, without tying this project to
one specific notification provider.

Dedup is DB-backed for both alert types, not in-memory — the Dashboard
calls GET /fraud-spikes and the Review Queue page calls GET /review on
every page load, so without persistence the same spike week or the same
high-risk case would re-fire a notification on every single refresh.
"""

import json
from datetime import datetime, timezone
from typing import Optional, Type
from urllib import error, request

import app.config as config
from app.db.database import SessionLocal
from app.models.db_models import ReviewAlertRow, SpikeAlertRow
from app.models.schemas import FraudRatePoint

WEBHOOK_TIMEOUT_SECONDS = 5


def _already_alerted(model: Type, key: str) -> bool:
    with SessionLocal() as db:
        return db.get(model, key) is not None


def _record_alert(model: Type, key_field: str, key: str, status_code: Optional[int]) -> None:
    with SessionLocal() as db:
        db.add(model(**{key_field: key, "alerted_at": datetime.now(timezone.utc).isoformat(), "webhook_status_code": status_code}))
        db.commit()


def _send_webhook(payload: dict) -> Optional[int]:
    """
    Plain stdlib HTTP POST — no extra runtime dependency needed for
    something this simple. Returns the response status code, or None if
    the request failed outright (network error, timeout, unreachable
    URL). A failed webhook doesn't raise — a notification failing to
    send shouldn't take down the endpoint that triggered it.
    """
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        config.ALERT_WEBHOOK_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=WEBHOOK_TIMEOUT_SECONDS) as resp:
            return resp.status
    except (error.URLError, error.HTTPError, TimeoutError, OSError):
        return None


def maybe_send_spike_alert(latest_period: FraudRatePoint, z_score_threshold: float) -> bool:
    """
    Sends a webhook notification if — and only if — the most recent
    period is a genuine, newly-detected spike:
      1. ALERT_WEBHOOK_URL is actually configured (no-op otherwise)
      2. latest_period.is_spike is true
      3. this exact period hasn't already triggered an alert before

    Returns True if an alert was sent for the CURRENT latest period
    (whether just now, or on a previous call) — this is what the API
    response's alert_sent_for_current_spike field reflects, so the
    frontend can show "already notified" rather than only "just sent".
    """
    if not latest_period.is_spike:
        return False

    if _already_alerted(SpikeAlertRow, latest_period.period_start):
        return True  # already alerted for this exact spike period

    if not config.ALERT_WEBHOOK_URL:
        return False  # would alert, but no webhook is configured

    message = (
        f"Fraud spike detected for week of {latest_period.period_start}: "
        f"chargeback rate {latest_period.chargeback_rate:.1%} "
        f"(z-score {latest_period.z_score:.2f}, threshold {z_score_threshold})"
    )
    payload = {
        "event": "fraud_spike_detected",
        "period_start": latest_period.period_start,
        "chargeback_rate": latest_period.chargeback_rate,
        "z_score": latest_period.z_score,
        "z_score_threshold": z_score_threshold,
        "order_count": latest_period.order_count,
        "chargeback_count": latest_period.chargeback_count,
        "message": message,
        # Slack's Incoming Webhook API specifically requires a "text" key
        # to render anything at all — without it, Slack silently rejects
        # the payload. Included alongside the richer structured fields
        # above so Discord/ntfy.sh/custom endpoints (which accept
        # arbitrary JSON) still get the full payload either way.
        "text": message,
    }

    status_code = _send_webhook(payload)
    _record_alert(SpikeAlertRow, "period_start", latest_period.period_start, status_code)
    return True


def maybe_send_review_alert(order_id: str, customer_id: str, order_value: float, risk_score: float, top_reason_label: str) -> bool:
    """
    Sends a webhook notification for a newly-discovered HIGH-risk review
    case — deliberately not "medium" band, matching realistic ops
    practice: a genuinely high-risk case is worth an active ping, not
    just another row in a list someone might not check today. Same
    dedup discipline as spike alerts: one notification per order_id,
    ever, regardless of how many times the review queue is reloaded.
    """
    if _already_alerted(ReviewAlertRow, order_id):
        return True

    if not config.ALERT_WEBHOOK_URL:
        return False

    message = (
        f"High-risk order flagged: {order_id} (₹{order_value:,.2f}), "
        f"risk score {risk_score:.1%} — {top_reason_label}"
    )
    payload = {
        "event": "high_risk_order_flagged",
        "order_id": order_id,
        "customer_id": customer_id,
        "order_value": order_value,
        "risk_score": risk_score,
        "top_reason": top_reason_label,
        "message": message,
        "text": message,  # required for Slack Incoming Webhooks specifically — see note above
    }

    status_code = _send_webhook(payload)
    _record_alert(ReviewAlertRow, "order_id", order_id, status_code)
    return True

# backend/tests/test_alerting.py
"""
Tests services/alerting.py against a REAL local HTTP server acting as
the webhook receiver — not a mocked urllib call. This proves the POST
actually happens over a real socket with the correct JSON payload,
which a mock could plausibly pass even if the real request construction
were subtly broken (wrong method, wrong content-type, malformed body).
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

import app.config as config
import app.services.alerting as alerting
from app.models.db_models import ReviewAlertRow, SpikeAlertRow
from app.models.schemas import FraudRatePoint


class _CapturingWebhookHandler(BaseHTTPRequestHandler):
    """Records every request it receives onto the class itself, so the
    test can inspect what was actually sent after the fact."""

    received: list = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        _CapturingWebhookHandler.received.append(
            {
                "path": self.path,
                "content_type": self.headers.get("Content-Type"),
                "body": json.loads(body),
            }
        )
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # silence default request logging in test output


@pytest.fixture()
def webhook_server():
    _CapturingWebhookHandler.received = []
    server = HTTPServer(("127.0.0.1", 0), _CapturingWebhookHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}/webhook"
    server.shutdown()
    thread.join(timeout=2)


@pytest.fixture(autouse=True)
def _clean_alert_tables():
    """Each test starts with clean spike_alerts and review_alerts tables
    so dedup state from one test doesn't leak into another."""
    from app.db.database import SessionLocal

    yield
    with SessionLocal() as db:
        db.query(SpikeAlertRow).delete()
        db.query(ReviewAlertRow).delete()
        db.commit()


def _spike_point(period_start="2026-06-01") -> FraudRatePoint:
    return FraudRatePoint(
        period_start=period_start,
        order_count=250,
        chargeback_count=45,
        chargeback_rate=0.18,
        rolling_mean=0.11,
        rolling_std=0.02,
        z_score=3.4,
        is_spike=True,
    )


def _non_spike_point() -> FraudRatePoint:
    return FraudRatePoint(
        period_start="2026-06-08",
        order_count=250,
        chargeback_count=25,
        chargeback_rate=0.10,
        rolling_mean=0.11,
        rolling_std=0.02,
        z_score=-0.4,
        is_spike=False,
    )


def test_webhook_actually_fires_with_correct_payload(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    point = _spike_point()
    result = alerting.maybe_send_spike_alert(point, z_score_threshold=2.0)

    assert result is True
    assert len(_CapturingWebhookHandler.received) == 1

    received = _CapturingWebhookHandler.received[0]
    assert received["content_type"] == "application/json"
    body = received["body"]
    assert body["event"] == "fraud_spike_detected"
    assert body["period_start"] == point.period_start
    assert body["z_score"] == point.z_score
    assert "message" in body


def test_payload_includes_text_field_for_slack_compatibility(webhook_server, monkeypatch):
    """Slack's Incoming Webhook API specifically requires a "text" key to
    render a message at all — without it, Slack silently rejects the
    payload and nothing appears in the channel. Both alert payloads must
    include it, not just the richer "message"/structured fields other
    services can use."""
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    alerting.maybe_send_spike_alert(_spike_point(period_start="2026-07-01"), z_score_threshold=2.0)
    alerting.maybe_send_review_alert(
        order_id="ORD-SLACK-TEST", customer_id="CUST-1", order_value=1000.0, risk_score=0.9, top_reason_label="x"
    )

    assert len(_CapturingWebhookHandler.received) == 2
    for received in _CapturingWebhookHandler.received:
        body = received["body"]
        assert "text" in body, f"payload missing required Slack 'text' field: {body}"
        assert body["text"] == body["message"], "text and message should carry the same content"
        assert len(body["text"]) > 0


def test_no_alert_for_non_spike_period(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    result = alerting.maybe_send_spike_alert(_non_spike_point(), z_score_threshold=2.0)

    assert result is False
    assert len(_CapturingWebhookHandler.received) == 0


def test_dedup_only_sends_once_for_the_same_spike_period(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    point = _spike_point()
    first = alerting.maybe_send_spike_alert(point, z_score_threshold=2.0)
    second = alerting.maybe_send_spike_alert(point, z_score_threshold=2.0)

    assert first is True
    assert second is True  # still "alerted", just not re-sent
    assert len(_CapturingWebhookHandler.received) == 1, "should only have actually POSTed once"


def test_no_webhook_call_when_not_configured(monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", "")

    result = alerting.maybe_send_spike_alert(_spike_point(period_start="2026-06-15"), z_score_threshold=2.0)

    assert result is False


def test_different_spike_periods_each_trigger_their_own_alert(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    alerting.maybe_send_spike_alert(_spike_point(period_start="2026-05-01"), z_score_threshold=2.0)
    alerting.maybe_send_spike_alert(_spike_point(period_start="2026-05-08"), z_score_threshold=2.0)

    assert len(_CapturingWebhookHandler.received) == 2


# ---------------------------------------------------------------------------
# Review-queue alerting — same real-webhook rigor as the spike-alert tests
# above, covering the newer maybe_send_review_alert() path.
# ---------------------------------------------------------------------------


def test_review_alert_fires_with_correct_payload(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    result = alerting.maybe_send_review_alert(
        order_id="ORD-TEST-001",
        customer_id="CUST-42",
        order_value=45000.0,
        risk_score=0.87,
        top_reason_label="Device linked to other recent accounts",
    )

    assert result is True
    assert len(_CapturingWebhookHandler.received) == 1

    body = _CapturingWebhookHandler.received[0]["body"]
    assert body["event"] == "high_risk_order_flagged"
    assert body["order_id"] == "ORD-TEST-001"
    assert body["order_value"] == 45000.0
    assert body["risk_score"] == 0.87
    assert "message" in body


def test_review_alert_dedup_only_sends_once_per_order(webhook_server, monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    kwargs = dict(order_id="ORD-DUP-001", customer_id="CUST-1", order_value=1000.0, risk_score=0.9, top_reason_label="x")
    first = alerting.maybe_send_review_alert(**kwargs)
    second = alerting.maybe_send_review_alert(**kwargs)

    assert first is True
    assert second is True  # still "alerted", just not re-sent
    assert len(_CapturingWebhookHandler.received) == 1


def test_review_alert_no_webhook_call_when_not_configured(monkeypatch):
    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", "")

    result = alerting.maybe_send_review_alert(
        order_id="ORD-NOCFG-001", customer_id="CUST-1", order_value=1000.0, risk_score=0.9, top_reason_label="x"
    )

    assert result is False


def test_seeding_the_review_queue_fires_alerts_for_high_risk_cases(webhook_server, monkeypatch):
    """End-to-end, not just the isolated alerting function: clears
    review_cases to force a genuinely fresh seed, calls the real
    _seed_if_empty() directly (the exact function GET /review calls),
    and confirms real webhook deliveries happened for every genuinely
    high-risk seeded case. Deliberately doesn't go through the shared
    session-scoped TestClient's /review endpoint for this — seeding only
    runs once per session on an empty table, so which test happens to
    call /review first would make this fragile to test-execution order
    across files. Directly clearing state and calling the seed function
    makes this deterministic regardless of what ran before it."""
    from app.db.database import SessionLocal
    from app.models.db_models import ReviewCaseRow
    from app.services import review_store

    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", webhook_server)

    with SessionLocal() as db:
        db.query(ReviewCaseRow).delete()
        db.commit()

    review_store._seed_if_empty()

    with SessionLocal() as db:
        seeded_rows = db.query(ReviewCaseRow).all()
    high_risk_order_ids = {r.order_id for r in seeded_rows if r.risk_band == "high"}

    assert len(high_risk_order_ids) > 0, "expected at least one high-risk case in a real seed"

    alerted_order_ids = {r["body"]["order_id"] for r in _CapturingWebhookHandler.received}
    assert alerted_order_ids == high_risk_order_ids, "every high-risk seeded case should have triggered exactly one real alert"

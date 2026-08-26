# backend/tests/test_review.py
def test_review_queue_returns_only_pending_cases(client):
    resp = client.get("/review")
    assert resp.status_code == 200
    cases = resp.json()

    assert len(cases) > 0, "queue should auto-seed on first access"
    for case in cases:
        assert case["status"] == "pending"
        assert case["risk_band"] in ("medium", "high"), "low-risk orders should never be seeded into the queue"


def test_resolve_moves_case_from_pending_to_resolved(client):
    pending_before = client.get("/review").json()
    target = pending_before[0]
    order_id = target["order_id"]

    resolve_resp = client.post(f"/review/{order_id}", json={"status": "approved"})
    assert resolve_resp.status_code == 200
    resolved_case = resolve_resp.json()
    assert resolved_case["status"] == "approved"
    assert resolved_case["resolved_at"] is not None

    pending_after = client.get("/review").json()
    assert order_id not in [c["order_id"] for c in pending_after]

    resolved_list = client.get("/review/resolved").json()
    assert order_id in [c["order_id"] for c in resolved_list]


def test_resolved_cases_sorted_most_recent_first(client):
    pending = client.get("/review").json()
    if len(pending) < 2:
        return  # not enough pending cases left to test ordering meaningfully

    client.post(f"/review/{pending[0]['order_id']}", json={"status": "blocked"})
    client.post(f"/review/{pending[1]['order_id']}", json={"status": "approved"})

    resolved = client.get("/review/resolved").json()
    timestamps = [c["resolved_at"] for c in resolved if c["resolved_at"]]
    assert timestamps == sorted(timestamps, reverse=True)


def test_resolving_nonexistent_case_returns_404(client):
    resp = client.post("/review/ORDER-THAT-DOES-NOT-EXIST", json={"status": "approved"})
    assert resp.status_code == 404


def test_resolve_rejects_invalid_status_value(client):
    pending = client.get("/review").json()
    if not pending:
        return
    resp = client.post(f"/review/{pending[0]['order_id']}", json={"status": "maybe"})
    assert resp.status_code == 422


def test_alert_sent_field_present_and_matches_high_risk_status(client):
    """Route-level check: every case in the real queue should report
    alert_sent, and — since alerting is scoped to "high" band only —
    a "medium" band case should never claim alert_sent=True even if a
    webhook happens to be configured in this environment."""
    pending = client.get("/review").json()
    assert len(pending) > 0

    for case in pending:
        assert "alert_sent" in case
        if case["risk_band"] == "medium":
            assert case["alert_sent"] is False, "medium-risk cases should never be marked as alerted"

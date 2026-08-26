# backend/tests/test_spikes.py
def test_spikes_returns_expected_shape(client):
    resp = client.get("/fraud-spikes")
    assert resp.status_code == 200
    body = resp.json()

    for key in ("granularity", "points", "spike_count", "latest_period", "z_score_threshold"):
        assert key in body

    assert body["granularity"] == "weekly"
    assert len(body["points"]) > 0


def test_spike_count_matches_actual_flagged_points(client):
    """The real invariant: spike_count in the summary should exactly
    equal the number of points where is_spike is true. This would catch
    a bug where the summary count and the per-point flags drift out of
    sync — e.g. if spike_count were computed before a later filtering
    step that removes a point."""
    body = client.get("/fraud-spikes").json()
    actual_spikes = sum(1 for p in body["points"] if p["is_spike"])
    assert actual_spikes == body["spike_count"]


def test_spikes_only_flag_upward_deviation(client):
    """spike_detector.py deliberately only flags upward z-score
    deviation — a rate drop isn't a fraud-ops emergency. Every flagged
    point should have a positive z-score above the threshold."""
    body = client.get("/fraud-spikes").json()
    threshold = body["z_score_threshold"]

    for point in body["points"]:
        if point["is_spike"]:
            assert point["z_score"] is not None
            assert point["z_score"] > threshold


def test_early_weeks_have_no_baseline_yet(client):
    """The first WINDOW_SIZE weeks can't have a trailing baseline —
    there aren't enough prior weeks to compute one. Confirms the API
    doesn't fabricate a baseline for weeks that shouldn't have one."""
    points = client.get("/fraud-spikes").json()["points"]
    first_point = points[0]
    assert first_point["rolling_mean"] is None
    assert first_point["is_spike"] is False


def test_alert_fields_present_and_consistent_with_latest_period(client):
    """Route-level check (not just the isolated alerting.py unit tests):
    hits the real /fraud-spikes endpoint and confirms the alert fields
    it sets are actually consistent with the real data — if the current
    latest period isn't a spike, alert_sent_for_current_spike must be
    False, regardless of whether a webhook happens to be configured in
    this environment."""
    body = client.get("/fraud-spikes").json()

    assert "alert_configured" in body
    assert "alert_sent_for_current_spike" in body
    assert isinstance(body["alert_configured"], bool)

    if not body["latest_period"]["is_spike"]:
        assert body["alert_sent_for_current_spike"] is False


def test_no_webhook_configured_means_no_alert_sent(client, monkeypatch):
    """With ALERT_WEBHOOK_URL unset, alert_sent_for_current_spike must
    be False even if the current latest period happens to be a spike —
    an unconfigured webhook should never silently pretend to have sent
    something."""
    import app.config as config

    monkeypatch.setattr(config, "ALERT_WEBHOOK_URL", "")

    body = client.get("/fraud-spikes").json()
    assert body["alert_configured"] is False
    assert body["alert_sent_for_current_spike"] is False

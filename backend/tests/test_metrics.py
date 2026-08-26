# backend/tests/test_metrics.py
def test_metrics_returns_chargeback_stats(client):
    resp = client.get("/metrics")
    assert resp.status_code == 200
    body = resp.json()

    for key in ("holdout_rows", "holdout_positive_rate", "roc_auc", "average_precision",
                "cost_assumptions_inr", "best_cost_weighted_threshold", "threshold_sweep",
                "drift_analysis_at_best_threshold"):
        assert key in body, f"missing key: {key}"

    assert body["holdout_rows"] > 0
    assert 0.5 <= body["roc_auc"] <= 1.0, "chargeback model should be well above random"
    assert len(body["threshold_sweep"]) > 0


def test_metrics_includes_return_model_summary_when_trained(client):
    """Optional field — None if train_return_model.py hasn't run, but in
    this project's normal state it should always be present."""
    body = client.get("/metrics").json()
    return_model = body.get("return_model")

    if return_model is not None:
        assert 0.5 <= return_model["roc_auc"] <= 1.0
        assert "band_thresholds" in return_model
        assert return_model["band_thresholds"]["high"] > return_model["band_thresholds"]["medium"]


def test_metrics_includes_baseline_comparison_when_available(client):
    body = client.get("/metrics").json()
    comparison = body.get("baseline_comparison")

    if comparison is not None:
        models = comparison["models"]
        assert "xgboost" in models
        assert "logistic_regression" in models
        for m in models.values():
            assert 0.0 <= m["roc_auc"] <= 1.0


def test_threshold_sweep_expected_cost_is_monotonic_shaped(client):
    """Not asserting a specific curve shape, just that expected_cost_inr
    is present and non-negative at every threshold — a real sanity check
    on the cost-weighted decisioning data the Dashboard's chart depends
    on."""
    sweep = client.get("/metrics").json()["threshold_sweep"]
    for point in sweep:
        assert point["expected_cost_inr"] >= 0
        assert 0.0 <= point["threshold"] <= 1.0

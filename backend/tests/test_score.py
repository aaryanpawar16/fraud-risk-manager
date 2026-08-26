# backend/tests/test_score.py
"""
Tests /score against the real trained model artifacts — not mocked.
The point of these tests isn't to re-verify model accuracy (that's what
ml/tests/ is for) — it's to verify the API contract: shape, validation,
and that a genuinely high-risk order actually scores higher than a
genuinely clean one, which would catch a wiring bug (e.g. accidentally
swapping which model's output goes where) that unit tests on the ML
side alone wouldn't.
"""

CLEAN_ORDER = {
    "order_id": "TEST-CLEAN",
    "account_age_days": 400,
    "is_new_account": False,
    "order_value": 1200,
    "item_category": "grocery",
    "payment_method": "upi",
    "discount_pct": 5,
    "shipping_billing_mismatch": False,
    "ip_country_mismatch": False,
    "device_reuse_signal": False,
    "num_previous_orders": 25,
    "num_previous_returns": 0,
    "num_previous_chargebacks": 0,
}

HIGH_RISK_ORDER = {
    "order_id": "TEST-HIGH-RISK",
    "account_age_days": 1,
    "is_new_account": True,
    "order_value": 45000,
    "item_category": "electronics",
    "payment_method": "cod",
    "discount_pct": 2,
    "shipping_billing_mismatch": True,
    "ip_country_mismatch": True,
    "device_reuse_signal": True,
    "num_previous_orders": 0,
    "num_previous_returns": 0,
    "num_previous_chargebacks": 2,
}


def test_score_returns_expected_shape(client):
    resp = client.post("/score", json=CLEAN_ORDER)
    assert resp.status_code == 200
    body = resp.json()

    for key in ("order_id", "risk_score", "risk_band", "top_reasons", "recommended_action", "return_risk"):
        assert key in body, f"missing key: {key}"

    assert 0.0 <= body["risk_score"] <= 1.0
    assert body["risk_band"] in ("low", "medium", "high")
    assert body["recommended_action"] in ("approve", "review", "block")
    assert isinstance(body["top_reasons"], list)

    return_risk = body["return_risk"]
    for key in ("risk_score", "risk_band", "top_reasons"):
        assert key in return_risk, f"missing return_risk key: {key}"
    assert 0.0 <= return_risk["risk_score"] <= 1.0


def test_high_risk_order_scores_higher_than_clean_order(client):
    """The real invariant that matters: a deliberately risky order
    should score higher than a deliberately clean one. This would catch
    a genuine wiring bug (e.g. the wrong model's output attached to the
    wrong field) that a pure shape-check wouldn't."""
    clean = client.post("/score", json=CLEAN_ORDER).json()
    risky = client.post("/score", json=HIGH_RISK_ORDER).json()

    assert risky["risk_score"] > clean["risk_score"]
    assert risky["risk_band"] in ("medium", "high")
    assert clean["risk_band"] == "low"


def test_top_reasons_are_sorted_and_positive_only(client):
    resp = client.post("/score", json=HIGH_RISK_ORDER)
    reasons = resp.json()["top_reasons"]

    contributions = [r["contribution"] for r in reasons]
    assert contributions == sorted(contributions, reverse=True)
    assert all(c > 0 for c in contributions)


def test_missing_required_field_returns_422(client):
    incomplete = {k: v for k, v in CLEAN_ORDER.items() if k != "order_value"}
    resp = client.post("/score", json=incomplete)
    assert resp.status_code == 422


def test_order_id_is_optional(client):
    order = {k: v for k, v in CLEAN_ORDER.items() if k != "order_id"}
    resp = client.post("/score", json=order)
    assert resp.status_code == 200
    assert resp.json()["order_id"] == "UNSCORED-ORDER"

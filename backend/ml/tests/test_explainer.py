"""
test_explainer.py

Tests explain.py's RiskExplainer against a freshly trained tiny model
(isolated in tmp_path, never touching the real artifacts/). Confirms:
  - output schema matches what the frontend's FeatureExplanation
    component expects
  - risk_score is a valid probability
  - top_reasons only includes features that pushed risk UP, sorted
    correctly, and capped at top_n
  - the whole result is JSON-serializable (this caught a real bug
    during development - numpy int64 isn't JSON serializable by default)
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from generate_synthetic_data import generate  # noqa: E402
import train as train_module  # noqa: E402


@pytest.fixture(scope="module")
def trained_workdir(tmp_path_factory, monkeypatch_module=None):
    tmp_path = tmp_path_factory.mktemp("explainer_test")
    os.makedirs(tmp_path / "data" / "raw", exist_ok=True)
    os.makedirs(tmp_path / "artifacts", exist_ok=True)

    df = generate(n_orders=4000, seed=55)
    df.to_csv(tmp_path / "data" / "raw" / "orders.csv", index=False)

    cwd = os.getcwd()
    os.chdir(tmp_path)
    train_module.main()
    os.chdir(cwd)

    return tmp_path


@pytest.fixture(scope="module")
def explainer(trained_workdir):
    from explain import RiskExplainer
    return RiskExplainer(artifacts_dir=str(trained_workdir / "artifacts"))


@pytest.fixture(scope="module")
def sample_order():
    return dict(
        account_age_days=2,
        is_new_account=1,
        order_value=45000.0,
        item_category="electronics",
        payment_method="cod",
        discount_pct=5.0,
        shipping_billing_mismatch=1,
        ip_country_mismatch=1,
        device_reuse_signal=1,
        num_previous_orders=0,
        num_previous_returns=0,
        num_previous_chargebacks=0,
    )


def test_explain_order_returns_expected_keys(explainer, sample_order):
    result = explainer.explain_order(sample_order)
    assert set(result.keys()) == {"risk_score", "top_reasons"}


def test_risk_score_is_valid_probability(explainer, sample_order):
    result = explainer.explain_order(sample_order)
    assert 0.0 <= result["risk_score"] <= 1.0


def test_top_reasons_respects_top_n_limit(explainer, sample_order):
    result = explainer.explain_order(sample_order, top_n=2)
    assert len(result["top_reasons"]) <= 2

    result_more = explainer.explain_order(sample_order, top_n=5)
    assert len(result_more["top_reasons"]) <= 5


def test_top_reasons_have_required_fields(explainer, sample_order):
    result = explainer.explain_order(sample_order)
    for reason in result["top_reasons"]:
        assert set(reason.keys()) == {"feature", "label", "contribution", "raw_value"}
        assert isinstance(reason["label"], str)
        assert len(reason["label"]) > 0


def test_top_reasons_are_sorted_descending_by_contribution(explainer, sample_order):
    result = explainer.explain_order(sample_order, top_n=10)
    contributions = [r["contribution"] for r in result["top_reasons"]]
    assert contributions == sorted(contributions, reverse=True)


def test_top_reasons_only_include_positive_contributions(explainer, sample_order):
    """Reasons shown to the merchant should only be features that pushed
    risk UP - showing risk-reducing features as 'reasons for the flag'
    would be misleading."""
    result = explainer.explain_order(sample_order, top_n=10)
    for reason in result["top_reasons"]:
        assert reason["contribution"] > 0


def test_high_risk_order_scores_higher_than_low_risk_order(explainer):
    high_risk = dict(
        account_age_days=1, is_new_account=1, order_value=80000.0,
        item_category="electronics", payment_method="cod", discount_pct=2.0,
        shipping_billing_mismatch=1, ip_country_mismatch=1, device_reuse_signal=1,
        num_previous_orders=0, num_previous_returns=0, num_previous_chargebacks=2,
    )
    low_risk = dict(
        account_age_days=400, is_new_account=0, order_value=800.0,
        item_category="grocery", payment_method="upi", discount_pct=5.0,
        shipping_billing_mismatch=0, ip_country_mismatch=0, device_reuse_signal=0,
        num_previous_orders=25, num_previous_returns=0, num_previous_chargebacks=0,
    )
    high_result = explainer.explain_order(high_risk)
    low_result = explainer.explain_order(low_risk)
    assert high_result["risk_score"] > low_result["risk_score"]


def test_result_is_json_serializable(explainer, sample_order):
    result = explainer.explain_order(sample_order)
    serialized = json.dumps(result)  # raises TypeError if not serializable
    reloaded = json.loads(serialized)
    assert reloaded["risk_score"] == result["risk_score"]


def test_unknown_category_does_not_crash(explainer, sample_order):
    """An order with a category the model never saw at train time should
    degrade gracefully (neutral/all-zero one-hot) rather than error."""
    order = dict(sample_order)
    order["item_category"] = "totally_new_category_xyz"
    result = explainer.explain_order(order)
    assert 0.0 <= result["risk_score"] <= 1.0


def test_missing_optional_field_does_not_crash(explainer):
    minimal_order = dict(
        account_age_days=10, is_new_account=0, order_value=1200.0,
        item_category="home", payment_method="upi",
    )
    result = explainer.explain_order(minimal_order)
    assert 0.0 <= result["risk_score"] <= 1.0

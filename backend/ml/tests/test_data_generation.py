"""
test_data_generation.py

Verifies the synthetic dataset is structurally sound BEFORE it ever
reaches training. If these fail, every downstream metric is meaningless.
"""

import sys
import os

import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from generate_synthetic_data import generate  # noqa: E402


@pytest.fixture(scope="module")
def df():
    return generate(n_orders=5000, seed=7)


REQUIRED_COLUMNS = {
    "order_id", "timestamp", "customer_id", "account_age_days",
    "is_new_account", "order_value", "item_category", "payment_method",
    "discount_pct", "shipping_billing_mismatch", "ip_country_mismatch",
    "device_id", "shipping_address_hash", "device_reuse_signal",
    "num_previous_orders", "num_previous_returns", "num_previous_chargebacks",
    "is_ring_order_GT", "returned", "chargeback",
}


def test_schema_has_required_columns(df):
    assert REQUIRED_COLUMNS.issubset(set(df.columns))


def test_row_count_matches_request(df):
    assert len(df) == 5000


def test_order_ids_are_unique(df):
    assert df["order_id"].is_unique


def test_no_nulls_in_core_columns(df):
    core = ["order_id", "timestamp", "customer_id", "order_value", "chargeback", "returned"]
    assert df[core].isnull().sum().sum() == 0


def test_labels_are_binary(df):
    assert set(df["chargeback"].unique()).issubset({0, 1})
    assert set(df["returned"].unique()).issubset({0, 1})
    assert set(df["is_ring_order_GT"].unique()).issubset({0, 1})


def test_chargeback_rate_is_realistic(df):
    # real-world chargeback rates are low single digits to low teens percent -
    # if this drifts wildly it signals a bug in the logistic score wiring
    rate = df["chargeback"].mean()
    assert 0.02 < rate < 0.30, f"chargeback rate {rate:.3%} outside plausible range"


def test_timestamps_are_sorted(df):
    ts = pd.to_datetime(df["timestamp"])
    assert ts.is_monotonic_increasing


def test_order_value_is_positive_and_bounded(df):
    assert (df["order_value"] > 0).all()
    assert (df["order_value"] <= 150000).all()


def test_ring_orders_have_higher_chargeback_rate(df):
    """
    Core causal sanity check: orders flagged as part of an abuse ring
    (ground truth, used only for generation) should show a MEASURABLY
    higher chargeback rate than non-ring orders. If this fails, the
    synthetic label isn't actually learnable from the ring signal and
    the abuse-ring detector demo would be hollow.
    """
    ring_rate = df.loc[df["is_ring_order_GT"] == 1, "chargeback"].mean()
    non_ring_rate = df.loc[df["is_ring_order_GT"] == 0, "chargeback"].mean()
    assert ring_rate > non_ring_rate * 2, (
        f"ring chargeback rate ({ring_rate:.3f}) not meaningfully higher than "
        f"non-ring ({non_ring_rate:.3f}) - check logistic score weights"
    )


def test_new_accounts_carry_more_risk(df):
    new_rate = df.loc[df["is_new_account"] == 1, "chargeback"].mean()
    old_rate = df.loc[df["is_new_account"] == 0, "chargeback"].mean()
    assert new_rate > old_rate


def test_shared_devices_exist_across_customers(df):
    """Abuse rings require the SAME device_id to appear under multiple
    distinct customer_ids - otherwise the graph clustering has nothing
    to detect."""
    device_customer_counts = df.groupby("device_id")["customer_id"].nunique()
    multi_customer_devices = (device_customer_counts > 1).sum()
    assert multi_customer_devices > 0


def test_generation_is_deterministic_given_seed():
    df_a = generate(n_orders=500, seed=99)
    df_b = generate(n_orders=500, seed=99)
    pd.testing.assert_frame_equal(df_a, df_b)


def test_different_seeds_produce_different_data():
    df_a = generate(n_orders=500, seed=1)
    df_b = generate(n_orders=500, seed=2)
    assert not df_a["chargeback"].equals(df_b["chargeback"])

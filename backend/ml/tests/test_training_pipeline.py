"""
test_training_pipeline.py

The most important test file for the "honest metrics" bar. Verifies:
  1. The split is genuinely time-based (no timestamp overlap/leakage).
  2. Leakage-prone columns (ground-truth ring label, raw identifiers,
     the `returned` column) never reach the feature matrix.
  3. Holdout one-hot columns are correctly aligned to train's schema
     even when a category is missing/extra in either split.
  4. A model trained on this pipeline actually beats a random/majority
     baseline on held-out data - i.e. it's not just memorizing noise.

Uses tmp_path + monkeypatch to run against a small synthetic dataset in
an isolated directory, so it never touches the real artifacts/ or data/
folders used for the actual submission.
"""

import json
import os
import sys

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import roc_auc_score
from sklearn.dummy import DummyClassifier

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from generate_synthetic_data import generate  # noqa: E402
import train as train_module  # noqa: E402


@pytest.fixture()
def workdir(tmp_path, monkeypatch):
    """Isolated working directory with its own data/ and artifacts/ folders."""
    os.makedirs(tmp_path / "data" / "raw", exist_ok=True)
    os.makedirs(tmp_path / "artifacts", exist_ok=True)

    df = generate(n_orders=6000, seed=123)
    df.to_csv(tmp_path / "data" / "raw" / "orders.csv", index=False)

    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_split_is_strictly_chronological(workdir):
    train_df, holdout_df, split_ts = train_module.load_and_split(holdout_frac=0.2)

    assert train_df["timestamp"].max() < holdout_df["timestamp"].min() or \
        train_df["timestamp"].max() <= split_ts <= holdout_df["timestamp"].min() + pd.Timedelta(seconds=1)
    assert (pd.to_datetime(train_df["timestamp"]) < pd.to_datetime(split_ts)).all()
    assert (pd.to_datetime(holdout_df["timestamp"]) >= pd.to_datetime(split_ts)).all()


def test_split_sizes_match_requested_fraction(workdir):
    train_df, holdout_df, _ = train_module.load_and_split(holdout_frac=0.2)
    total = len(train_df) + len(holdout_df)
    holdout_ratio = len(holdout_df) / total
    assert abs(holdout_ratio - 0.2) < 0.02  # allow small rounding slack


def test_no_row_appears_in_both_splits(workdir):
    train_df, holdout_df, _ = train_module.load_and_split(holdout_frac=0.2)
    overlap = set(train_df["order_id"]) & set(holdout_df["order_id"])
    assert len(overlap) == 0


def test_leakage_columns_excluded_from_features(workdir):
    train_df, _, _ = train_module.load_and_split(holdout_frac=0.2)
    X, y = train_module.build_features(train_df)

    forbidden = {"order_id", "timestamp", "customer_id", "device_id",
                 "shipping_address_hash", "is_ring_order_GT", "returned", "chargeback"}
    assert forbidden.isdisjoint(set(X.columns)), (
        f"Leakage columns found in feature matrix: {forbidden & set(X.columns)}"
    )
    assert set(y.unique()).issubset({0, 1})


def test_align_columns_handles_missing_category(workdir):
    train_df, holdout_df, _ = train_module.load_and_split(holdout_frac=0.2)
    X_train, _ = train_module.build_features(train_df)
    reference_cols = list(X_train.columns)

    # simulate a holdout batch missing a category present in train
    X_holdout, _ = train_module.build_features(holdout_df)
    X_holdout_partial = X_holdout.drop(columns=[reference_cols[-1]], errors="ignore")

    aligned = train_module.align_columns(X_holdout_partial, reference_cols)
    assert list(aligned.columns) == reference_cols
    assert not aligned.isnull().any().any()


def test_align_columns_drops_unexpected_extra_column(workdir):
    train_df, _, _ = train_module.load_and_split(holdout_frac=0.2)
    X_train, _ = train_module.build_features(train_df)
    reference_cols = list(X_train.columns)

    X_with_extra = X_train.copy()
    X_with_extra["totally_new_unexpected_column"] = 1

    aligned = train_module.align_columns(X_with_extra, reference_cols)
    assert "totally_new_unexpected_column" not in aligned.columns
    assert list(aligned.columns) == reference_cols


def test_trained_model_beats_random_baseline(workdir):
    """
    The real test of whether this pipeline produces a useful model:
    it must beat a majority-class / random baseline on held-out AUC.
    A baseline predicting the training positive rate for everything
    gets AUC ~0.5. Our model should clear that with margin.
    """
    from xgboost import XGBClassifier

    train_df, holdout_df, _ = train_module.load_and_split(holdout_frac=0.2)
    X_train, y_train = train_module.build_features(train_df)
    feature_columns = list(X_train.columns)
    X_holdout, y_holdout = train_module.build_features(holdout_df)
    X_holdout = train_module.align_columns(X_holdout, feature_columns)

    pos = y_train.sum()
    neg = len(y_train) - pos
    scale_pos_weight = neg / max(pos, 1)

    model = XGBClassifier(
        n_estimators=100, max_depth=4, learning_rate=0.08,
        scale_pos_weight=scale_pos_weight, eval_metric="aucpr",
        random_state=42, n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_prob = model.predict_proba(X_holdout)[:, 1]
    model_auc = roc_auc_score(y_holdout, y_prob)

    dummy = DummyClassifier(strategy="stratified", random_state=42)
    dummy.fit(X_train, y_train)
    dummy_prob = dummy.predict_proba(X_holdout)[:, 1]
    dummy_auc = roc_auc_score(y_holdout, dummy_prob)

    assert model_auc > 0.65, f"Model AUC {model_auc:.3f} too low - check feature wiring"
    assert model_auc > dummy_auc + 0.15, (
        f"Model (AUC={model_auc:.3f}) barely beats random baseline "
        f"(AUC={dummy_auc:.3f}) - not learning a real signal"
    )


def test_full_train_script_produces_all_artifacts(workdir):
    train_module.main()

    for fname in ["model.pkl", "shap_explainer.pkl", "feature_columns.json",
                  "train_holdout_meta.json"]:
        assert os.path.exists(os.path.join("artifacts", fname)), f"missing {fname}"

    with open("artifacts/train_holdout_meta.json") as f:
        meta = json.load(f)
    assert meta["train_rows"] > 0
    assert meta["holdout_rows"] > 0
    assert 0 <= meta["train_positive_rate"] <= 1

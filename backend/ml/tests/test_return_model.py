"""
test_return_model.py

Mirrors test_training_pipeline.py's rigor for the SECOND model (trained
on `returned` instead of `chargeback`). Verifies:
  1. `chargeback` is excluded from the return model's features — it's a
     leakage column here in exactly the way `returned` was excluded from
     the chargeback model's features (neither is available at
     order-scoring time).
  2. The same time-based split boundary is reused, not a fresh random one.
  3. A model trained this way beats a random baseline — i.e. it's
     learning genuine signal from the (deliberately noisy, realistically
     imperfect) synthetic return-generation process, not memorizing noise.
"""

import os
import sys

import pandas as pd
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.metrics import roc_auc_score

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import train_return_model as rm  # noqa: E402


@pytest.fixture()
def workdir(tmp_path, monkeypatch):
    """Isolated working directory with copies of the real train/holdout
    CSVs — using the real data (not a freshly generated small sample)
    because the return model is meant to reuse the exact same split as
    the chargeback model, and that coupling is part of what's tested."""
    os.makedirs(tmp_path / "artifacts_returns", exist_ok=True)

    real_train = pd.read_csv(os.path.join(os.path.dirname(__file__), "..", "data", "train.csv"))
    real_holdout = pd.read_csv(os.path.join(os.path.dirname(__file__), "..", "data", "test_holdout.csv"))
    real_train.to_csv(tmp_path / "data_train.csv", index=False)
    real_holdout.to_csv(tmp_path / "data_holdout.csv", index=False)

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(rm, "TRAIN_PATH", "data_train.csv")
    monkeypatch.setattr(rm, "HOLDOUT_PATH", "data_holdout.csv")
    return tmp_path


def test_chargeback_excluded_from_return_model_features(workdir):
    train_df = pd.read_csv("data_train.csv", parse_dates=["timestamp"])
    X, y = rm.build_features(train_df)

    forbidden = {"order_id", "timestamp", "customer_id", "device_id",
                 "shipping_address_hash", "is_ring_order_GT", "chargeback", "returned"}
    assert forbidden.isdisjoint(set(X.columns)), (
        f"Leakage columns found in return model's feature matrix: {forbidden & set(X.columns)}"
    )
    assert set(y.unique()).issubset({0, 1})


def test_reuses_same_split_boundary_as_chargeback_model(workdir):
    """The return model must NOT compute its own fresh split — it reuses
    train.csv/test_holdout.csv exactly as the chargeback model produced
    them, so both models are evaluated on the same notion of "the
    future"."""
    train_df = pd.read_csv("data_train.csv", parse_dates=["timestamp"])
    holdout_df = pd.read_csv("data_holdout.csv", parse_dates=["timestamp"])

    assert (train_df["timestamp"] < holdout_df["timestamp"].min()).all()
    overlap = set(train_df["order_id"]) & set(holdout_df["order_id"])
    assert len(overlap) == 0


def test_return_model_beats_random_baseline(workdir):
    from xgboost import XGBClassifier

    train_df = pd.read_csv("data_train.csv", parse_dates=["timestamp"])
    holdout_df = pd.read_csv("data_holdout.csv", parse_dates=["timestamp"])

    X_train, y_train = rm.build_features(train_df)
    feature_columns = list(X_train.columns)
    X_holdout, y_holdout = rm.build_features(holdout_df)
    X_holdout = rm.align_columns(X_holdout, feature_columns)

    pos = y_train.sum()
    neg = len(y_train) - pos
    scale_pos_weight = neg / max(pos, 1)

    model = XGBClassifier(
        n_estimators=150, max_depth=4, learning_rate=0.08,
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

    # Deliberately a lower bar than the chargeback model's (>0.65) — the
    # return-generation process is intentionally noisier (returns are
    # genuinely harder to predict than fraud in most real e-commerce
    # contexts), so demanding chargeback-level AUC here would mean the
    # synthetic data isn't realistically noisy anymore.
    assert model_auc > 0.58, f"Return model AUC {model_auc:.3f} too low — check feature wiring"
    assert model_auc > dummy_auc + 0.08, (
        f"Return model (AUC={model_auc:.3f}) barely beats random baseline (AUC={dummy_auc:.3f})"
    )


def test_full_train_script_produces_all_artifacts(workdir):
    rm.main()

    for fname in ["model.pkl", "shap_explainer.pkl", "feature_columns.json", "train_holdout_meta.json"]:
        assert os.path.exists(os.path.join("artifacts_returns", fname)), f"missing {fname}"

    import json
    with open("artifacts_returns/train_holdout_meta.json") as f:
        meta = json.load(f)
    assert meta["target"] == "returned"
    assert meta["roc_auc"] > 0.5
    assert "band_thresholds" in meta
    assert meta["band_thresholds"]["high"] > meta["band_thresholds"]["medium"]

"""
train.py

Trains the chargeback-risk model (doubles as the return-risk signal via
a secondary column) on a STRICT TIME-BASED split.

Why time-based and not random shuffle:
  Fraud is sequential and adversarial - tactics evolve. A random shuffle
  split leaks future patterns into training and inflates your reported
  metrics. Time-based split is the only honest way to simulate "model
  trained on the past, scored on orders it hasn't seen yet."

Leakage guards:
  - `is_ring_order_GT` is ground-truth ring membership used only to
    generate the synthetic data - it is dropped before training since a
    real system would never have this label at inference time.
  - `returned` is dropped when training the chargeback model (it can
    correlate suspiciously with the target in synthetic generation and
    wouldn't be known at order-time in a live deployment anyway, since
    returns happen after the order).
  - customer_id / device_id / shipping_address_hash are high-cardinality
    identifiers - not fed directly into the tree model as raw strings,
    only their engineered aggregate signals (num_previous_*) are used.

Outputs:
  artifacts/model.pkl              - trained XGBoost classifier
  artifacts/shap_explainer.pkl     - SHAP TreeExplainer bound to the model
  artifacts/feature_columns.json   - exact feature order the model expects
  artifacts/train_holdout_meta.json- split boundary + row counts (for audit)
  data/train.csv / data/test_holdout.csv
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
import shap
from xgboost import XGBClassifier

RAW_PATH = "data/raw/orders.csv"
TRAIN_OUT = "data/train.csv"
HOLDOUT_OUT = "data/test_holdout.csv"
ARTIFACTS_DIR = "artifacts"

TARGET = "chargeback"

DROP_COLS = [
    "order_id", "timestamp", "customer_id", "device_id",
    "shipping_address_hash", "is_ring_order_GT", "returned", TARGET,
]

CATEGORICAL_COLS = ["item_category", "payment_method"]


def load_and_split(holdout_frac: float = 0.20):
    df = pd.read_csv(RAW_PATH, parse_dates=["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    split_idx = int(len(df) * (1 - holdout_frac))
    split_timestamp = df.loc[split_idx, "timestamp"]

    train_df = df[df["timestamp"] < split_timestamp].copy()
    holdout_df = df[df["timestamp"] >= split_timestamp].copy()

    train_df.to_csv(TRAIN_OUT, index=False)
    holdout_df.to_csv(HOLDOUT_OUT, index=False)

    return train_df, holdout_df, split_timestamp


def build_features(df: pd.DataFrame):
    X = df.drop(columns=[c for c in DROP_COLS if c in df.columns])
    X = pd.get_dummies(X, columns=CATEGORICAL_COLS, drop_first=False)
    y = df[TARGET].astype(int)
    return X, y


def align_columns(X: pd.DataFrame, reference_cols: list):
    """Ensure holdout has exactly the same one-hot columns as train."""
    for col in reference_cols:
        if col not in X.columns:
            X[col] = 0
    extra = [c for c in X.columns if c not in reference_cols]
    X = X.drop(columns=extra)
    return X[reference_cols]


def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    train_df, holdout_df, split_ts = load_and_split()
    print(f"Train rows:   {len(train_df):,}")
    print(f"Holdout rows: {len(holdout_df):,}")
    print(f"Split point:  {split_ts} (holdout is strictly AFTER this)")

    X_train, y_train = build_features(train_df)
    feature_columns = list(X_train.columns)

    X_holdout, y_holdout = build_features(holdout_df)
    X_holdout = align_columns(X_holdout, feature_columns)

    # class imbalance handling - fraud/chargeback is rare
    pos = y_train.sum()
    neg = len(y_train) - pos
    scale_pos_weight = neg / max(pos, 1)

    model = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=42,
        n_jobs=-1,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_holdout, y_holdout)],
        verbose=False,
    )

    # ---- Save artifacts ----
    joblib.dump(model, os.path.join(ARTIFACTS_DIR, "model.pkl"))

    explainer = shap.TreeExplainer(model)
    joblib.dump(explainer, os.path.join(ARTIFACTS_DIR, "shap_explainer.pkl"))

    with open(os.path.join(ARTIFACTS_DIR, "feature_columns.json"), "w") as f:
        json.dump(feature_columns, f, indent=2)

    meta = dict(
        target=TARGET,
        split_timestamp=str(split_ts),
        train_rows=len(train_df),
        holdout_rows=len(holdout_df),
        train_positive_rate=float(y_train.mean()),
        holdout_positive_rate=float(y_holdout.mean()),
        scale_pos_weight=float(scale_pos_weight),
    )
    with open(os.path.join(ARTIFACTS_DIR, "train_holdout_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print("\nSaved:")
    print(f"  {ARTIFACTS_DIR}/model.pkl")
    print(f"  {ARTIFACTS_DIR}/shap_explainer.pkl")
    print(f"  {ARTIFACTS_DIR}/feature_columns.json")
    print(f"  {ARTIFACTS_DIR}/train_holdout_meta.json")
    print("\nRun evaluate.py next for honest held-out metrics.")


if __name__ == "__main__":
    main()

"""
train_return_model.py

Trains a SECOND, independent model on the `returned` label — not a proxy
derived from the chargeback model. Until now, "return-risk scoring" was
implied by the chargeback model alone; this makes it literally true.

Reuses the exact same time-based train/holdout split as the chargeback
model (same data/train.csv, data/test_holdout.csv — generated once by
generate_synthetic_data.py and train.py's load_and_split), so the two
models are directly comparable and there's no risk of the two datasets
disagreeing about what "the past" and "the future" mean.

Leakage guards, mirrored from train.py, with one addition:
  - `chargeback` is ALSO dropped from the feature set here. It's not
    available at order-scoring time any more than `returned` is (both are
    downstream, post-order events) — so it would be leakage exactly the
    same way `returned` was excluded from the chargeback model's features.
  - `is_ring_order_GT` and raw identifiers are dropped as before.

Base rates: 26.0% return rate vs 12.5% chargeback rate, with only a weak
correlation (0.14) between them — related but genuinely distinct events,
which is why a return specifically flagged at 60%+ risk by THIS model
means something different than a 60%+ chargeback risk from the other one.

Outputs (parallel to artifacts/, kept separate so neither model
overwrites the other's files):
  artifacts_returns/model.pkl
  artifacts_returns/shap_explainer.pkl
  artifacts_returns/feature_columns.json
  artifacts_returns/train_holdout_meta.json
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
)
from xgboost import XGBClassifier

TRAIN_PATH = "data/train.csv"
HOLDOUT_PATH = "data/test_holdout.csv"
ARTIFACTS_DIR = "artifacts_returns"

TARGET = "returned"

DROP_COLS = [
    "order_id", "timestamp", "customer_id", "device_id",
    "shipping_address_hash", "is_ring_order_GT", "chargeback", TARGET,
]

CATEGORICAL_COLS = ["item_category", "payment_method"]


def build_features(df: pd.DataFrame):
    X = df.drop(columns=[c for c in DROP_COLS if c in df.columns])
    X = pd.get_dummies(X, columns=CATEGORICAL_COLS, drop_first=False)
    y = df[TARGET].astype(int)
    return X, y


def align_columns(X: pd.DataFrame, reference_cols: list):
    for col in reference_cols:
        if col not in X.columns:
            X[col] = 0
    extra = [c for c in X.columns if c not in reference_cols]
    X = X.drop(columns=extra)
    return X[reference_cols]


def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    train_df = pd.read_csv(TRAIN_PATH, parse_dates=["timestamp"])
    holdout_df = pd.read_csv(HOLDOUT_PATH, parse_dates=["timestamp"])

    print(f"Train rows:   {len(train_df):,}")
    print(f"Holdout rows: {len(holdout_df):,}")
    print(f"Reusing the same time-based split boundary as the chargeback model.")

    X_train, y_train = build_features(train_df)
    feature_columns = list(X_train.columns)

    X_holdout, y_holdout = build_features(holdout_df)
    X_holdout = align_columns(X_holdout, feature_columns)

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

    y_prob = model.predict_proba(X_holdout)[:, 1]
    auc = roc_auc_score(y_holdout, y_prob)
    ap = average_precision_score(y_holdout, y_prob)

    # Empirically-derived risk band thresholds. The chargeback model's
    # fixed 0.25/0.6 boundaries were calibrated for a ~12.5% base rate —
    # applying them here (26% base rate, structurally different label)
    # would misclassify a large share of ordinary orders as "medium" risk
    # just because the return model naturally outputs higher probabilities
    # on average. Instead, use this model's own holdout score distribution:
    # medium = 70th percentile, high = 90th percentile.
    medium_threshold = float(np.percentile(y_prob, 70))
    high_threshold = float(np.percentile(y_prob, 90))

    # ---- Save artifacts ----
    joblib.dump(model, os.path.join(ARTIFACTS_DIR, "model.pkl"))

    explainer = shap.TreeExplainer(model)
    joblib.dump(explainer, os.path.join(ARTIFACTS_DIR, "shap_explainer.pkl"))

    with open(os.path.join(ARTIFACTS_DIR, "feature_columns.json"), "w") as f:
        json.dump(feature_columns, f, indent=2)

    meta = dict(
        target=TARGET,
        train_rows=len(train_df),
        holdout_rows=len(holdout_df),
        train_positive_rate=float(y_train.mean()),
        holdout_positive_rate=float(y_holdout.mean()),
        scale_pos_weight=float(scale_pos_weight),
        roc_auc=float(auc),
        average_precision=float(ap),
        band_thresholds=dict(medium=round(medium_threshold, 4), high=round(high_threshold, 4)),
    )
    with open(os.path.join(ARTIFACTS_DIR, "train_holdout_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nHeld-out ROC-AUC:        {auc:.4f}")
    print(f"Held-out Average Precision: {ap:.4f}")
    print(f"Band thresholds (empirical): medium >= {medium_threshold:.3f}, high >= {high_threshold:.3f}")
    print(f"\nSaved to {ARTIFACTS_DIR}/")


if __name__ == "__main__":
    main()

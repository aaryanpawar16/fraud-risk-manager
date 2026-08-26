"""
evaluate.py

Produces the "honest metrics" report:
  1. Precision / recall / F1 / confusion matrix at multiple thresholds
     (not one cherry-picked cutoff).
  2. Cost-weighted expected loss curve: converts FP/FN into rupee terms
     and finds the threshold that MINIMIZES business cost, not the one
     that maximizes accuracy.
  3. Drift analysis: splits the holdout set into "early" vs "late" time
     slices and reports whether precision/recall degrade on the more
     recent slice (this is where the injected tactic-shift in the
     synthetic data will show up).

Cost assumptions (edit these to match your merchant's real numbers -
these are the two knobs the frontend's ThresholdSlider will expose):
  FP_COST: cost of wrongly flagging a legitimate order
           (lost sale + customer friction + support time)
  FN_COST: cost of missing an actual chargeback
           (order value + chargeback fee + goods lost + processor penalty risk)

Run:
    python evaluate.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    confusion_matrix,
    precision_recall_curve,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
)

ARTIFACTS_DIR = "artifacts"
HOLDOUT_PATH = "data/test_holdout.csv"
REPORT_DIR = "reports"

TARGET = "chargeback"
DROP_COLS = [
    "order_id", "timestamp", "customer_id", "device_id",
    "shipping_address_hash", "is_ring_order_GT", "returned", TARGET,
]
CATEGORICAL_COLS = ["item_category", "payment_method"]

# ---- Cost assumptions (₹) - stated explicitly per the track's honesty bar ----
FP_COST = 350     # avg margin/friction cost of wrongly blocking a good order
FN_COST = 4500    # avg chargeback fee + lost goods + order value (partial)
COST_SENSITIVITY_MULTIPLIERS = [1, 2, 5]  # "what if FN cost is 2x/5x FP cost"


def build_features(df, feature_columns):
    X = df.drop(columns=[c for c in DROP_COLS if c in df.columns])
    X = pd.get_dummies(X, columns=CATEGORICAL_COLS, drop_first=False)
    for col in feature_columns:
        if col not in X.columns:
            X[col] = 0
    X = X[feature_columns]
    y = df[TARGET].astype(int)
    return X, y


def metrics_at_threshold(y_true, y_prob, threshold):
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    expected_cost = fp * FP_COST + fn * FN_COST
    return dict(
        threshold=round(float(threshold), 2),
        precision=round(float(precision), 4),
        recall=round(float(recall), 4),
        f1=round(float(f1), 4),
        tp=int(tp), fp=int(fp), fn=int(fn), tn=int(tn),
        expected_cost_inr=int(expected_cost),
    )


def cost_curve(y_true, y_prob, thresholds=None):
    if thresholds is None:
        thresholds = np.round(np.arange(0.05, 0.96, 0.05), 2)
    rows = [metrics_at_threshold(y_true, y_prob, t) for t in thresholds]
    df = pd.DataFrame(rows)
    best = df.loc[df["expected_cost_inr"].idxmin()]
    return df, best


def sensitivity_analysis(y_true, y_prob, thresholds=None):
    if thresholds is None:
        thresholds = np.round(np.arange(0.05, 0.96, 0.05), 2)
    results = {}
    base_fp_cost = FP_COST
    for mult in COST_SENSITIVITY_MULTIPLIERS:
        fn_cost = base_fp_cost * mult if mult == 1 else FN_COST * (mult / COST_SENSITIVITY_MULTIPLIERS[0])
        rows = []
        for t in thresholds:
            y_pred = (y_prob >= t).astype(int)
            tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
            cost = fp * base_fp_cost + fn * (FN_COST * mult)
            rows.append(dict(threshold=float(t), expected_cost_inr=int(cost)))
        df = pd.DataFrame(rows)
        best_row = df.loc[df["expected_cost_inr"].idxmin()]
        results[f"FN_cost_x{mult}"] = dict(
            best_threshold=float(best_row["threshold"]),
            min_expected_cost_inr=int(best_row["expected_cost_inr"]),
        )
    return results


def drift_analysis(holdout_df, y_prob, y_true, threshold, n_slices=2):
    """Split holdout chronologically and compare precision/recall per slice."""
    df = holdout_df.copy().reset_index(drop=True)
    df["_prob"] = y_prob
    df["_true"] = y_true.values
    df = df.sort_values("timestamp").reset_index(drop=True)

    slice_size = len(df) // n_slices
    slices = []
    for i in range(n_slices):
        start = i * slice_size
        end = (i + 1) * slice_size if i < n_slices - 1 else len(df)
        chunk = df.iloc[start:end]
        y_pred = (chunk["_prob"] >= threshold).astype(int)
        p = precision_score(chunk["_true"], y_pred, zero_division=0)
        r = recall_score(chunk["_true"], y_pred, zero_division=0)
        slices.append(dict(
            slice=f"slice_{i+1}_of_{n_slices}",
            date_range=[str(chunk["timestamp"].min()), str(chunk["timestamp"].max())],
            n_orders=len(chunk),
            precision=round(float(p), 4),
            recall=round(float(r), 4),
            positive_rate=round(float(chunk["_true"].mean()), 4),
        ))
    return slices


def main():
    os.makedirs(REPORT_DIR, exist_ok=True)

    model = joblib.load(os.path.join(ARTIFACTS_DIR, "model.pkl"))
    with open(os.path.join(ARTIFACTS_DIR, "feature_columns.json")) as f:
        feature_columns = json.load(f)

    holdout_df = pd.read_csv(HOLDOUT_PATH, parse_dates=["timestamp"])
    X_holdout, y_holdout = build_features(holdout_df, feature_columns)

    y_prob = model.predict_proba(X_holdout)[:, 1]

    # ---- 1. Precision/recall/F1 at multiple thresholds ----
    curve_df, best_f1_row = None, None
    thresholds = np.round(np.arange(0.05, 0.96, 0.05), 2)
    threshold_report = [metrics_at_threshold(y_holdout, y_prob, t) for t in thresholds]
    threshold_df = pd.DataFrame(threshold_report)

    # ---- 2. Global ranking metrics (threshold-independent) ----
    auc = roc_auc_score(y_holdout, y_prob)
    ap = average_precision_score(y_holdout, y_prob)

    # ---- 3. Cost-weighted optimal threshold ----
    cdf, best_cost_row = cost_curve(y_holdout, y_prob, thresholds)

    # ---- 4. Sensitivity analysis on FN/FP cost ratio ----
    sensitivity = sensitivity_analysis(y_holdout, y_prob, thresholds)

    # ---- 5. Drift analysis at the cost-optimal threshold ----
    drift = drift_analysis(holdout_df, y_prob, y_holdout,
                            threshold=best_cost_row["threshold"], n_slices=3)

    report = dict(
        holdout_rows=len(holdout_df),
        holdout_positive_rate=round(float(y_holdout.mean()), 4),
        roc_auc=round(float(auc), 4),
        average_precision=round(float(ap), 4),
        cost_assumptions_inr=dict(false_positive_cost=FP_COST, false_negative_cost=FN_COST),
        best_cost_weighted_threshold=best_cost_row.to_dict(),
        threshold_sweep=threshold_report,
        cost_sensitivity_analysis=sensitivity,
        drift_analysis_at_best_threshold=drift,
    )

    with open(os.path.join(REPORT_DIR, "metrics_report.json"), "w") as f:
        json.dump(report, f, indent=2, default=str)

    threshold_df.to_csv(os.path.join(REPORT_DIR, "threshold_sweep.csv"), index=False)

    # ---- Console summary ----
    print("=" * 60)
    print("HELD-OUT EVALUATION (strictly time-split, model never saw these)")
    print("=" * 60)
    print(f"Holdout size:        {len(holdout_df):,}")
    print(f"Positive (chargeback) rate: {y_holdout.mean():.3%}")
    print(f"ROC-AUC:             {auc:.4f}")
    print(f"Average Precision:   {ap:.4f}")
    print()
    print(f"Cost-optimal threshold: {best_cost_row['threshold']}")
    print(f"  precision={best_cost_row['precision']}  recall={best_cost_row['recall']}  "
          f"f1={best_cost_row['f1']}")
    print(f"  FP={best_cost_row['fp']}  FN={best_cost_row['fn']}  "
          f"expected_cost=₹{best_cost_row['expected_cost_inr']:,}")
    print()
    print("Drift check across holdout period (early -> late):")
    for s in drift:
        print(f"  {s['slice']}  ({s['date_range'][0][:10]} to {s['date_range'][1][:10]}): "
              f"precision={s['precision']}  recall={s['recall']}  "
              f"n={s['n_orders']}")
    print()
    print(f"Full report saved to {REPORT_DIR}/metrics_report.json")


if __name__ == "__main__":
    main()

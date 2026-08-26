"""
explain.py

Turns a raw SHAP value vector into the "top 3 contributing features"
human-readable explanation used by the frontend's FeatureExplanation
component. Kept separate from the FastAPI layer so it's directly
unit-testable and reusable by evaluate.py / notebooks.

Usage:
    from explain import explain_order
    result = explain_order(order_features_dict)
    # -> {"risk_score": 0.83, "top_reasons": [...]}
"""

import json
import os

import joblib
import pandas as pd

ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

# Human-readable labels for engineered features. Anything not listed here
# falls back to a title-cased version of the raw column name.
FEATURE_LABELS = {
    "shipping_billing_mismatch": "Shipping address differs from billing address",
    "ip_country_mismatch": "Order IP location doesn't match account country",
    "device_reuse_signal": "Device linked to other recent accounts",
    "is_new_account": "Account is less than 7 days old",
    "num_previous_chargebacks": "Customer has prior chargebacks",
    "num_previous_returns": "Customer has a history of returns",
    "num_previous_orders": "Customer order history length",
    "order_value": "Order value",
    "discount_pct": "Discount applied to order",
    "account_age_days": "Account age",
}


def _label_for(col: str) -> str:
    if col in FEATURE_LABELS:
        return FEATURE_LABELS[col]
    for cat_prefix in ("item_category_", "payment_method_"):
        if col.startswith(cat_prefix):
            value = col[len(cat_prefix):]
            field = "Category" if "item_category" in cat_prefix else "Payment method"
            return f"{field}: {value}"
    return col.replace("_", " ").title()


class RiskExplainer:
    def __init__(self, artifacts_dir: str = ARTIFACTS_DIR):
        self.model = joblib.load(os.path.join(artifacts_dir, "model.pkl"))
        self.explainer = joblib.load(os.path.join(artifacts_dir, "shap_explainer.pkl"))
        with open(os.path.join(artifacts_dir, "feature_columns.json")) as f:
            self.feature_columns = json.load(f)

    def _vectorize(self, order_features: dict) -> pd.DataFrame:
        """Build a single-row DataFrame matching training-time feature layout."""
        row = {col: 0 for col in self.feature_columns}

        for key, value in order_features.items():
            if key in ("item_category", "payment_method"):
                one_hot_col = f"{key}_{value}"
                if one_hot_col in row:
                    row[one_hot_col] = 1
                # unseen category at inference -> stays all-zero for that
                # field, which is the safe/neutral fallback
            elif key in row:
                row[key] = int(value) if isinstance(value, bool) else value

        return pd.DataFrame([row], columns=self.feature_columns)

    def explain_order(self, order_features: dict, top_n: int = 3) -> dict:
        X = self._vectorize(order_features)
        risk_score = float(self.model.predict_proba(X)[0, 1])

        shap_values = self.explainer.shap_values(X)
        # binary classifier -> shap_values is a single array of shape (1, n_features)
        values = shap_values[0] if hasattr(shap_values, "shape") else shap_values[1][0]

        contributions = list(zip(self.feature_columns, values, X.iloc[0].tolist()))
        # only surface features that pushed risk UP (positive contribution)
        # and that were actually "active" (non-zero) on this order
        active_positive = [
            (col, val, raw) for col, val, raw in contributions
            if val > 0 and raw != 0
        ]
        active_positive.sort(key=lambda t: t[1], reverse=True)

        def _clean(v):
            if isinstance(v, (pd.Timestamp,)):
                return str(v)
            if hasattr(v, "item"):  # numpy scalar -> native python
                return v.item()
            return v

        top_reasons = [
            dict(
                feature=col,
                label=_label_for(col),
                contribution=round(float(val), 4),
                raw_value=_clean(raw),
            )
            for col, val, raw in active_positive[:top_n]
        ]

        return dict(risk_score=round(risk_score, 4), top_reasons=top_reasons)


if __name__ == "__main__":
    # quick smoke test against one holdout row
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    holdout = pd.read_csv(os.path.join(os.path.dirname(__file__), "data", "test_holdout.csv"))
    sample = holdout.iloc[0].to_dict()

    explainer = RiskExplainer()
    result = explainer.explain_order(sample)
    print(json.dumps(result, indent=2))

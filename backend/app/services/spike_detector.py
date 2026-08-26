# backend/app/services/spike_detector.py
"""
Fraud-spike detector: aggregates real chargeback rate into weekly buckets
and flags weeks where the rate is a statistical outlier relative to the
preceding weeks — a genuinely different signal from the per-order risk
scorer (which judges one order in isolation) and the abuse-ring graph
(which finds coordinated identity sharing). This one watches the
aggregate rate over time, the way a merchant's ops dashboard would.

Method: trailing rolling z-score. For each week, compute the mean and
std of chargeback rate over the PRECEDING N weeks (not including the
current week — using the current week in its own baseline would make it
harder for a real spike to stand out, and is a common mistake in naive
anomaly detection). Flag a week as a spike if:
  - its z-score exceeds Z_THRESHOLD, AND
  - it's an upward deviation (we care about fraud rate rising, not
    dropping — a rate drop isn't a fraud-ops emergency)
  - the trailing window has enough data to compute a meaningful std
    (skip the first WINDOW_SIZE weeks, where there's no real baseline yet)

This is computed from the actual train+holdout data — not a scripted
fake spike — so however many spikes it finds (or doesn't) is a real
property of the dataset, consistent with the project's "honest metrics"
approach elsewhere.
"""

from pathlib import Path
from typing import List, Optional

import pandas as pd

from app.config import DATA_DIR
from app.models.schemas import FraudRatePoint, FraudSpikeReport

WINDOW_SIZE = 8  # trailing weeks used as the baseline
Z_THRESHOLD = 2.0

_cache: Optional[FraudSpikeReport] = None


def _load_orders() -> pd.DataFrame:
    train = pd.read_csv(Path(DATA_DIR) / "train.csv", parse_dates=["timestamp"])
    holdout = pd.read_csv(Path(DATA_DIR) / "test_holdout.csv", parse_dates=["timestamp"])
    return pd.concat([train, holdout], ignore_index=True)


def build_spike_report() -> FraudSpikeReport:
    global _cache
    if _cache is not None:
        return _cache

    df = _load_orders()
    weekly = (
        df.set_index("timestamp")
        .resample("W")
        .agg(order_count=("chargeback", "size"), chargeback_count=("chargeback", "sum"))
    )

    # The dataset ends mid-week, so the final bucket is a partial week with
    # far fewer orders than a typical one — its chargeback rate is a noisy
    # small-sample estimate, not a real signal, and would show up as a
    # misleading dip/spike on the chart if left in. Drop it if it's
    # clearly incomplete (well below the median week's volume).
    if len(weekly) > 1:
        median_volume = weekly["order_count"].median()
        if weekly["order_count"].iloc[-1] < 0.5 * median_volume:
            weekly = weekly.iloc[:-1]

    weekly["chargeback_rate"] = weekly["chargeback_count"] / weekly["order_count"]

    # Trailing window: shift(1) first so the current week is excluded from
    # its own baseline, then take a rolling mean/std over the prior weeks.
    trailing = weekly["chargeback_rate"].shift(1)
    rolling_mean = trailing.rolling(window=WINDOW_SIZE, min_periods=WINDOW_SIZE).mean()
    rolling_std = trailing.rolling(window=WINDOW_SIZE, min_periods=WINDOW_SIZE).std()

    points: List[FraudRatePoint] = []
    spike_count = 0

    for i, (period_end, row) in enumerate(weekly.iterrows()):
        mean = rolling_mean.iloc[i]
        std = rolling_std.iloc[i]

        z = None
        is_spike = False
        if pd.notna(mean) and pd.notna(std) and std > 1e-6:
            z = float((row["chargeback_rate"] - mean) / std)
            is_spike = z > Z_THRESHOLD

        if is_spike:
            spike_count += 1

        points.append(
            FraudRatePoint(
                period_start=(period_end - pd.Timedelta(days=6)).date().isoformat(),
                order_count=int(row["order_count"]),
                chargeback_count=int(row["chargeback_count"]),
                chargeback_rate=round(float(row["chargeback_rate"]), 4),
                rolling_mean=round(float(mean), 4) if pd.notna(mean) else None,
                rolling_std=round(float(std), 4) if pd.notna(std) else None,
                z_score=round(z, 2) if z is not None else None,
                is_spike=is_spike,
            )
        )

    report = FraudSpikeReport(
        granularity="weekly",
        points=points,
        spike_count=spike_count,
        latest_period=points[-1],
        z_score_threshold=Z_THRESHOLD,
    )
    _cache = report
    return report

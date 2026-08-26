# backend/app/models/schemas.py
"""
Pydantic models. Field names and shapes deliberately mirror
frontend/src/api/types.ts exactly — if you change a field here, update
the matching TS interface too, or the frontend will silently receive
undefined for that field.
"""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel

RiskBand = Literal["low", "medium", "high"]


# ---------------------------------------------------------------------------
# /score
# ---------------------------------------------------------------------------

class OrderInput(BaseModel):
    order_id: Optional[str] = None
    account_age_days: int
    is_new_account: bool
    order_value: float
    item_category: str
    payment_method: str
    discount_pct: float
    shipping_billing_mismatch: bool
    ip_country_mismatch: bool
    device_reuse_signal: bool
    num_previous_orders: int
    num_previous_returns: int
    num_previous_chargebacks: int


class FeatureReason(BaseModel):
    feature: str
    label: str
    contribution: float
    raw_value: Union[float, str]


class ReturnRiskResult(BaseModel):
    """
    Output of the SECOND, independent model trained on the `returned`
    label (see ml/train_return_model.py) — not the chargeback model's
    score reused as a proxy. Its own risk band, since the two models
    have structurally different base rates and score distributions (see
    scorer.py's return_band_from_score).
    """

    risk_score: float
    risk_band: RiskBand
    top_reasons: List[FeatureReason]


class ScoreResult(BaseModel):
    order_id: str
    risk_score: float
    risk_band: RiskBand
    top_reasons: List[FeatureReason]
    recommended_action: Literal["approve", "review", "block"]
    return_risk: ReturnRiskResult


# ---------------------------------------------------------------------------
# /review
# ---------------------------------------------------------------------------

class ReviewCase(BaseModel):
    order_id: str
    customer_id: str
    order_value: float
    risk_score: float
    risk_band: RiskBand
    top_reason_label: str
    flagged_at: str
    status: Literal["pending", "approved", "blocked"]
    resolved_at: Optional[str] = None
    alert_sent: bool = False


class ReviewResolveRequest(BaseModel):
    status: Literal["approved", "blocked"]


# ---------------------------------------------------------------------------
# /metrics
# ---------------------------------------------------------------------------

class ThresholdSweepPoint(BaseModel):
    threshold: float
    precision: float
    recall: float
    f1: float
    tp: int
    fp: int
    fn: int
    tn: int
    expected_cost_inr: int


class DriftSlice(BaseModel):
    slice: str
    date_range: List[str]
    n_orders: int
    precision: float
    recall: float
    positive_rate: float


class CostAssumptions(BaseModel):
    false_positive_cost: int
    false_negative_cost: int


class ReturnModelSummary(BaseModel):
    """
    Headline stats for the SEPARATE return-risk model (see
    ml/train_return_model.py), attached to the same /metrics response so
    the Dashboard can show both models' health at a glance rather than
    only ever reporting on the chargeback model. Sourced from
    artifacts_returns/train_holdout_meta.json — the return model's own
    training run output, not recomputed here.
    """

    holdout_rows: int
    holdout_positive_rate: float
    roc_auc: float
    average_precision: float
    band_thresholds: dict


class BaselineModelStats(BaseModel):
    description: str
    roc_auc: float
    average_precision: float
    precision_at_threshold: float
    recall_at_threshold: float
    f1_at_threshold: float


class BaselineComparison(BaseModel):
    """
    Answers "why XGBoost, not something simpler?" with an actual measured
    comparison rather than an assumed answer — see
    ml/train_baseline_model.py. On this dataset the honest result is that
    a plain logistic regression baseline edges out XGBoost slightly
    (the synthetic data's generative process is linear in log-odds by
    construction), which is reported as-is, not hidden.
    """

    comparison_threshold: float
    holdout_rows: int
    models: dict  # {"xgboost": BaselineModelStats, "logistic_regression": BaselineModelStats}
    roc_auc_improvement: float
    average_precision_improvement: float


class MetricsReport(BaseModel):
    holdout_rows: int
    holdout_positive_rate: float
    roc_auc: float
    average_precision: float
    cost_assumptions_inr: CostAssumptions
    best_cost_weighted_threshold: ThresholdSweepPoint
    threshold_sweep: List[ThresholdSweepPoint]
    drift_analysis_at_best_threshold: List[DriftSlice]
    return_model: Optional[ReturnModelSummary] = None
    baseline_comparison: Optional[BaselineComparison] = None


# ---------------------------------------------------------------------------
# /graph
# ---------------------------------------------------------------------------

NodeType = Literal["customer", "device", "address"]


class GraphNode(BaseModel):
    id: str
    type: NodeType
    label: str
    risk_score: Optional[float] = None
    ring_id: int


class GraphLink(BaseModel):
    source: str
    target: str


class RingMember(BaseModel):
    id: str
    label: str
    risk_score: float


class RingSummary(BaseModel):
    """
    Ring-level context that used to require visually tracing graph edges
    by eye — who else is in this cluster, how severe is the worst member,
    and whether it's a shared device (a much stronger signal) or a shared
    address (weaker — families and roommates legitimately share these).
    """

    ring_id: int
    customer_count: int
    connection_type: Literal["device", "address", "both"]
    max_risk_score: float
    members: List[RingMember]


class AbuseGraphData(BaseModel):
    nodes: List[GraphNode]
    links: List[GraphLink]
    ring_count: int
    rings: List[RingSummary]


# ---------------------------------------------------------------------------
# /evidence
# ---------------------------------------------------------------------------

class EvidenceSection(BaseModel):
    title: str
    content: str
    included: bool


class EvidencePacket(BaseModel):
    order_id: str
    generated_at: str
    sections: List[EvidenceSection]
    pdf_url: str


# ---------------------------------------------------------------------------
# /score/batch
# ---------------------------------------------------------------------------

class BatchScoreRow(BaseModel):
    row_number: int
    order_id: Optional[str] = None
    risk_score: Optional[float] = None
    risk_band: Optional[RiskBand] = None
    recommended_action: Optional[str] = None
    return_risk_score: Optional[float] = None
    return_risk_band: Optional[RiskBand] = None
    error: Optional[str] = None


class BatchScoreSummary(BaseModel):
    total_rows: int
    scored_rows: int
    failed_rows: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    high_return_risk_count: int
    generated_at: str
    csv_url: str
    preview_rows: List[BatchScoreRow]


# ---------------------------------------------------------------------------
# /fraud-spikes
# ---------------------------------------------------------------------------

class FraudRatePoint(BaseModel):
    period_start: str  # ISO date, start of the week this point covers
    order_count: int
    chargeback_count: int
    chargeback_rate: float
    rolling_mean: Optional[float] = None
    rolling_std: Optional[float] = None
    z_score: Optional[float] = None
    is_spike: bool = False


class FraudSpikeReport(BaseModel):
    granularity: str
    points: List[FraudRatePoint]
    spike_count: int
    latest_period: FraudRatePoint
    z_score_threshold: float
    alert_configured: bool = False
    alert_sent_for_current_spike: bool = False

// src/api/types.ts
// Shared types matching the FastAPI backend's Pydantic schemas.

export type RiskBand = "low" | "medium" | "high";

export interface FeatureReason {
  feature: string;
  label: string;
  contribution: number;
  raw_value: number | string;
}

export interface ScoreResult {
  order_id: string;
  risk_score: number; // 0-1
  risk_band: RiskBand;
  top_reasons: FeatureReason[];
  recommended_action: "approve" | "review" | "block";
  return_risk: ReturnRiskResult;
}

export interface ReturnRiskResult {
  risk_score: number;
  risk_band: RiskBand;
  top_reasons: FeatureReason[];
}

export interface OrderInput {
  order_id?: string;
  account_age_days: number;
  is_new_account: boolean;
  order_value: number;
  item_category: string;
  payment_method: string;
  discount_pct: number;
  shipping_billing_mismatch: boolean;
  ip_country_mismatch: boolean;
  device_reuse_signal: boolean;
  num_previous_orders: number;
  num_previous_returns: number;
  num_previous_chargebacks: number;
}

export interface ReviewCase {
  order_id: string;
  customer_id: string;
  order_value: number;
  risk_score: number;
  risk_band: RiskBand;
  top_reason_label: string;
  flagged_at: string; // ISO timestamp
  status: "pending" | "approved" | "blocked";
  resolved_at?: string | null; // ISO timestamp, set only once resolved
  alert_sent: boolean;
}

export interface ThresholdSweepPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  expected_cost_inr: number;
}

export interface DriftSlice {
  slice: string;
  date_range: [string, string];
  n_orders: number;
  precision: number;
  recall: number;
  positive_rate: number;
}

export interface ReturnModelSummary {
  holdout_rows: number;
  holdout_positive_rate: number;
  roc_auc: number;
  average_precision: number;
  band_thresholds: { medium: number; high: number };
}

export interface BaselineModelStats {
  description: string;
  roc_auc: number;
  average_precision: number;
  precision_at_threshold: number;
  recall_at_threshold: number;
  f1_at_threshold: number;
}

export interface BaselineComparison {
  comparison_threshold: number;
  holdout_rows: number;
  models: {
    xgboost: BaselineModelStats;
    logistic_regression: BaselineModelStats;
  };
  roc_auc_improvement: number;
  average_precision_improvement: number;
}

export interface MetricsReport {
  holdout_rows: number;
  holdout_positive_rate: number;
  roc_auc: number;
  average_precision: number;
  cost_assumptions_inr: { false_positive_cost: number; false_negative_cost: number };
  best_cost_weighted_threshold: ThresholdSweepPoint;
  threshold_sweep: ThresholdSweepPoint[];
  drift_analysis_at_best_threshold: DriftSlice[];
  return_model?: ReturnModelSummary | null;
  baseline_comparison?: BaselineComparison | null;
}

export interface GraphNode {
  id: string;
  type: "customer" | "device" | "address";
  label: string;
  risk_score?: number;
  ring_id: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface RingMember {
  id: string;
  label: string;
  risk_score: number;
}

export interface RingSummary {
  ring_id: number;
  customer_count: number;
  connection_type: "device" | "address" | "both";
  max_risk_score: number;
  members: RingMember[];
}

export interface AbuseGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  ring_count: number;
  rings: RingSummary[];
}

export interface EvidenceSection {
  title: string;
  content: string;
  included: boolean;
}

export interface EvidencePacket {
  order_id: string;
  generated_at: string;
  sections: EvidenceSection[];
  pdf_url: string;
}

export interface BatchScoreRow {
  row_number: number;
  order_id: string | null;
  risk_score: number | null;
  risk_band: RiskBand | null;
  recommended_action: string | null;
  return_risk_score: number | null;
  return_risk_band: RiskBand | null;
  error: string | null;
}

export interface BatchScoreSummary {
  total_rows: number;
  scored_rows: number;
  failed_rows: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  high_return_risk_count: number;
  generated_at: string;
  csv_url: string;
  preview_rows: BatchScoreRow[];
}

export interface FraudRatePoint {
  period_start: string;
  order_count: number;
  chargeback_count: number;
  chargeback_rate: number;
  rolling_mean: number | null;
  rolling_std: number | null;
  z_score: number | null;
  is_spike: boolean;
}

export interface FraudSpikeReport {
  granularity: string;
  points: FraudRatePoint[];
  spike_count: number;
  latest_period: FraudRatePoint;
  z_score_threshold: number;
  alert_configured: boolean;
  alert_sent_for_current_spike: boolean;
}

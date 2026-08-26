// src/api/client.ts
// Thin fetch wrappers around the FastAPI backend. Every function throws a
// typed ApiError on non-2xx so pages can render a real error state instead
// of silently showing stale/empty data.

import type {
  ScoreResult,
  OrderInput,
  ReviewCase,
  MetricsReport,
  AbuseGraphData,
  EvidencePacket,
  FraudSpikeReport,
  BatchScoreSummary,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export { BASE_URL };

/**
 * Resolves a path the backend returns (e.g. a generated file's pdf_url)
 * against the API origin, not the frontend's own origin. Backend
 * responses use relative paths like "/evidence-files/ORD-1.pdf" so the
 * API stays portable across environments — but an <a href> or fetch
 * pointed at that raw relative path resolves against whatever page it's
 * rendered on (the Vite dev server at :5173, not the API at :8000),
 * silently hitting the wrong server. Already-absolute URLs pass through
 * unchanged.
 */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(body || `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  scoreOrder: (order: OrderInput) =>
    request<ScoreResult>("/score", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  getReviewQueue: () => request<ReviewCase[]>("/review"),

  getResolvedCases: () => request<ReviewCase[]>("/review/resolved"),

  resolveReviewCase: (orderId: string, action: "approved" | "blocked") =>
    request<ReviewCase>(`/review/${orderId}`, {
      method: "POST",
      body: JSON.stringify({ status: action }),
    }),

  getMetrics: () => request<MetricsReport>("/metrics"),

  getAbuseGraph: () => request<AbuseGraphData>("/graph"),

  generateEvidence: (orderId: string) =>
    request<EvidencePacket>(`/evidence/${orderId}`, { method: "POST" }),

  getFraudSpikes: () => request<FraudSpikeReport>("/fraud-spikes"),

  checkHealth: () => request<{ status: string; service: string }>("/"),

  scoreBatch: async (file: File): Promise<BatchScoreSummary> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/score/batch`, { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let detail = body;
      try {
        detail = JSON.parse(body).detail ?? body;
      } catch {
        // body wasn't JSON — use as-is
      }
      throw new ApiError(detail || `Upload failed (${res.status})`, res.status);
    }
    return res.json() as Promise<BatchScoreSummary>;
  },
};

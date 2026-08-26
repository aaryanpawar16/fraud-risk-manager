// src/lib/utils.ts
// Small, dependency-light helpers shared across pages. Kept framework-agnostic
// (no React imports here) so this file stays easily unit-testable on its own.

import type { RiskBand } from "@/api/types";

/**
 * Merge conditional class names without pulling in clsx/tailwind-merge as a
 * dependency. Accepts strings, falsy values, and [condition, className]
 * pairs.
 *
 *   cn("row", isActive && "row--active", ["error" , hasError])
 */
export type ClassValue = string | false | null | undefined | [string, boolean];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (Array.isArray(v)) {
      const [cls, condition] = v;
      if (condition) out.push(cls);
    } else {
      out.push(v);
    }
  }
  return out.join(" ");
}

/** Format a rupee amount with Indian digit grouping: 1234567 -> "₹12,34,567" */
export function formatINR(value: number, opts: { decimals?: number } = {}): string {
  const { decimals = 0 } = opts;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Compact rupee amount for chart axes/tight spaces: 125000 -> "₹1.25L" */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${value.toFixed(0)}`;
}

/** 0.1834 -> "18.3%" */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/** "2 minutes ago", "3 hours ago", "5 days ago" - for review queue timestamps */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [string, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [label, secondsInUnit] of units) {
    const count = Math.floor(seconds / secondsInUnit);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps a raw model probability to a risk band. Kept here (not just in
 * atoms.tsx) as the single source of truth for threshold boundaries, since
 * both the ScoreOrder page and any backend-mirrored logic should agree on
 * where "medium" starts.
 */
export function bandFromScore(score: number, thresholds: { medium: number; high: number } = { medium: 0.25, high: 0.6 }): RiskBand {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  return "low";
}

/** Shortens a long identifier for display: "ORD-0004821" stays as-is,
 * but a raw hash like "cust_9f3ab72c1e" -> "cust_9f3a…72c1e" */
export function truncateId(id: string, keepStart = 8, keepEnd = 4): string {
  if (id.length <= keepStart + keepEnd + 1) return id;
  return `${id.slice(0, keepStart)}…${id.slice(-keepEnd)}`;
}

/** Debounce for search/filter inputs (e.g. evidence order-ID lookup). */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** Safe JSON parse that never throws - returns fallback on malformed input. */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

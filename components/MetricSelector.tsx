// Sprint P7 Phase 3 (2026-04-28): page-level multi-metric ranking
// selector. Multi-select pills above page content; composite rank when
// 2+ metrics are active. URL-persistent via ?metric=reach,interactions
// so the selection survives navigation between pages.
//
// Used on 6 pages: Overview · Trends · Engagement · Timing · Reels ·
// Explore. The selector applies SELECTIVELY per page — the propagation
// contract lives in docs/ROADMAP.md Sprint P7. Diagnosis · Plan ·
// Outcomes do NOT receive a metric selector (those are
// AI-output / time-bucketed views, not metric-rankable).
//
// Flavor B per spec: equal-weight averaging when 2+ selected. Composite
// score for a row = mean(percentile_rank(metric_i)) across selected
// metrics. Single-select still works (default for backward compat).
// Weighted sliders (Flavor A) are deferred to v1.5 — pills can stay,
// the lib/composite helper grows a weights argument later.

import Link from "next/link";

export type RankingMetric = "reach" | "interactions" | "engagement" | "shares";

export const METRIC_OPTIONS: { id: RankingMetric; label: string }[] = [
  { id: "reach", label: "Total reach" },
  { id: "interactions", label: "Interactions" },
  { id: "engagement", label: "Engagement rate" },
  { id: "shares", label: "Shares" },
];

const VALID_METRICS = new Set<string>(METRIC_OPTIONS.map((o) => o.id));

/**
 * Parse the ?metric=... query string into a deduped, validated set of
 * RankingMetric values. Defaults to ["reach"] when missing/empty.
 *
 * Accepts comma-separated value (canonical: ?metric=reach,interactions).
 * Single-value form (?metric=reach) also works.
 */
export function parseMetricParam(
  raw: string | string[] | undefined,
): RankingMetric[] {
  const flat = Array.isArray(raw) ? raw.join(",") : raw || "";
  const parts = flat
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_METRICS.has(s)) as RankingMetric[];
  // Dedup while preserving order.
  const seen = new Set<RankingMetric>();
  const out: RankingMetric[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out.length ? out : ["reach"];
}

/**
 * Build a URL that toggles `metric` in the active set. Active becomes
 * inactive; inactive becomes active. Always preserves at least 1
 * metric selected (clicking the only active one is a no-op).
 */
function buildToggleUrl(
  basePath: string,
  active: RankingMetric[],
  metric: RankingMetric,
  preserve: Record<string, string | string[] | undefined>,
): string {
  const isActive = active.includes(metric);
  const next = isActive
    ? active.filter((m) => m !== metric)
    : [...active, metric];
  // Refuse to remove the last active metric — clicking the only active
  // pill keeps it selected (the URL is the same as current).
  const finalSet = next.length ? next : active;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (k === "metric") continue;
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  // Only emit ?metric=... when not the default (single "reach"). Keeps
  // URLs short on the common case.
  if (!(finalSet.length === 1 && finalSet[0] === "reach")) {
    params.set("metric", finalSet.join(","));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

type MetricSelectorProps = {
  /** Path prefix for pill <Link>s (e.g. "/", "/trends", "/explore") */
  basePath: string;
  /** Active selection (parsed from ?metric=... via parseMetricParam) */
  active: RankingMetric[];
  /** Optional label override (default "Rank by:") */
  label?: string;
  /** Other search params to preserve on the toggle URLs */
  preserve?: Record<string, string | string[] | undefined>;
};

export default function MetricSelector({
  basePath,
  active,
  label = "Rank by",
  preserve = {},
}: MetricSelectorProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}:
      </span>
      {METRIC_OPTIONS.map((opt) => {
        const isActive = active.includes(opt.id);
        return (
          <Link
            key={opt.id}
            href={buildToggleUrl(basePath, active, opt.id, preserve)}
            scroll={false}
            aria-pressed={isActive}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              isActive
                ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo"
                : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
      {active.length > 1 && (
        <span className="text-[11px] text-ink-muted ml-1">
          composite ({active.length} metrics, equal weight)
        </span>
      )}
    </div>
  );
}

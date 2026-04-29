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
 * Sprint P7 v3.5: parse the ?weights=... query string into a positional
 * weight array matching the active metric set. Comma-separated integers
 * (canonical: ?weights=70,30 for two metrics). Returns undefined when
 * the param is missing OR doesn't match the metric count — caller
 * falls back to equal-weight (Flavor B). Sum-normalization happens in
 * compositeScore; this helper just parses + validates length.
 */
export function parseWeightsParam(
  raw: string | string[] | undefined,
  metricCount: number,
): number[] | undefined {
  if (!raw || metricCount === 0) return undefined;
  const flat = Array.isArray(raw) ? raw.join(",") : raw;
  const parts = flat.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== metricCount) return undefined;
  if (parts.some((n) => !isFinite(n) || n < 0)) return undefined;
  if (parts.every((n) => n === 0)) return undefined; // all-zero invalid
  return parts;
}

/**
 * Build a URL that toggles `metric` in the active set. Active becomes
 * inactive; inactive becomes active. Always preserves at least 1
 * metric selected (clicking the only active one is a no-op).
 *
 * v3.5: when toggling changes the metric count, the weights param is
 * dropped (positional weights of length N can't survive a length
 * change cleanly — equal-weight default kicks in until the user
 * customizes weights again for the new set).
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
    if (k === "metric" || k === "weights") continue;
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

/**
 * v3.5: Build a URL that adjusts ONE metric's weight by `delta` (in
 * percentage points). Other weights stay at their current values.
 * The composite score's normalizer handles non-100-summing inputs, so
 * we don't enforce a strict sum here — keeps the +/- buttons simple
 * (each click ±10 points). Clamps to [0, 100].
 */
function buildWeightAdjustUrl(
  basePath: string,
  active: RankingMetric[],
  weights: number[],
  metricIdx: number,
  delta: number,
  preserve: Record<string, string | string[] | undefined>,
): string {
  const next = [...weights];
  next[metricIdx] = Math.max(0, Math.min(100, (next[metricIdx] || 0) + delta));
  // Don't allow all-zero — clicking - on the last non-zero pill snaps
  // back to current rather than producing an invalid all-zero URL.
  if (next.every((w) => w === 0)) return ""; // no-op marker
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (k === "weights") continue;
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  if (!(active.length === 1 && active[0] === "reach")) {
    params.set("metric", active.join(","));
  }
  // Encode weights as integers when possible for URL cleanliness.
  params.set("weights", next.map((w) => Math.round(w)).join(","));
  return `${basePath}?${params.toString()}`;
}

/**
 * v3.5: Build a URL that resets weights to equal (drops the param).
 */
function buildWeightResetUrl(
  basePath: string,
  active: RankingMetric[],
  preserve: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (k === "weights") continue;
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  if (!(active.length === 1 && active[0] === "reach")) {
    params.set("metric", active.join(","));
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
  /** v3.5: optional weights from ?weights=... (parsed by parseWeightsParam).
   *  When omitted, equal-weight composite (Flavor B). When present, weighted
   *  composite (Flavor A). Length MUST match active.length when provided. */
  weights?: number[];
};

export default function MetricSelector({
  basePath,
  active,
  label = "Rank by",
  preserve = {},
  weights,
}: MetricSelectorProps) {
  const isComposite = active.length > 1;
  const hasCustomWeights = weights && weights.length === active.length;
  // Compute the displayed weight per metric. With custom weights, show
  // each as % of total (so they sum to 100 in the UI even if URL has
  // raw values like 70,30 or 80,40). Equal-weight default = 100/N.
  const displayWeights: number[] = hasCustomWeights
    ? (() => {
        const total = (weights as number[]).reduce((s, x) => s + x, 0);
        return total > 0
          ? (weights as number[]).map((w) => (w / total) * 100)
          : active.map(() => 100 / active.length);
      })()
    : active.map(() => 100 / active.length);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
        {isComposite && (
          <span className="text-[11px] text-ink-muted ml-1">
            composite · {hasCustomWeights ? "custom weights" : `${active.length} metrics, equal weight`}
          </span>
        )}
      </div>
      {/* v3.5 (2026-04-29): weight customization row when 2+ metrics active.
          Each active metric gets a row showing its current weight as a
          percentage with +/- buttons (±10 points each click). Server-
          rendered <Link>s update the ?weights=... URL param. Reset link
          drops the param entirely (back to equal weight). */}
      {isComposite && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-muted hover:text-brand-shikho-indigo inline-flex items-center gap-1.5 select-none">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            Customize weights{hasCustomWeights ? "" : " (currently equal)"}
          </summary>
          <div className="mt-2 ml-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.map((m, idx) => {
              const opt = METRIC_OPTIONS.find((o) => o.id === m)!;
              const display = Math.round(displayWeights[idx]);
              const currentWeights = hasCustomWeights
                ? (weights as number[])
                : active.map(() => 100 / active.length);
              const decUrl = buildWeightAdjustUrl(basePath, active, currentWeights, idx, -10, preserve);
              const incUrl = buildWeightAdjustUrl(basePath, active, currentWeights, idx, +10, preserve);
              return (
                <div key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-ink-paper border border-ink-100">
                  <span className="text-xs font-medium text-ink-secondary flex-1 min-w-0 truncate">{opt.label}</span>
                  <Link
                    href={decUrl || "#"}
                    scroll={false}
                    aria-label={`Decrease ${opt.label} weight`}
                    className={`w-6 h-6 inline-flex items-center justify-center rounded-md text-xs font-bold ${decUrl ? "bg-ink-100 text-ink-secondary hover:bg-shikho-indigo-50 hover:text-brand-shikho-indigo" : "bg-ink-50 text-ink-300 cursor-not-allowed pointer-events-none"}`}
                  >
                    −
                  </Link>
                  <span className="text-xs font-semibold text-brand-shikho-indigo tabular-nums w-10 text-center">
                    {display}%
                  </span>
                  <Link
                    href={incUrl || "#"}
                    scroll={false}
                    aria-label={`Increase ${opt.label} weight`}
                    className={`w-6 h-6 inline-flex items-center justify-center rounded-md text-xs font-bold ${incUrl ? "bg-ink-100 text-ink-secondary hover:bg-shikho-indigo-50 hover:text-brand-shikho-indigo" : "bg-ink-50 text-ink-300 cursor-not-allowed pointer-events-none"}`}
                  >
                    +
                  </Link>
                </div>
              );
            })}
          </div>
          {hasCustomWeights && (
            <div className="mt-2 ml-4">
              <Link
                href={buildWeightResetUrl(basePath, active, preserve)}
                scroll={false}
                className="text-[11px] text-ink-muted hover:text-brand-shikho-indigo underline underline-offset-2"
              >
                Reset to equal weights
              </Link>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

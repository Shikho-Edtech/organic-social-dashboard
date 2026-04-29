// Aggregation and filtering helpers for dashboard views
import type { Post, DailyMetric } from "./types";
import { summarize, type Summary } from "./stats";

// ─── Date helpers (Bangladesh time, UTC+6) ───

// Day 2N: prefer the pipeline-written `Created Time (BDT)` column over
// the UTC column + setHours arithmetic. The old path depended on Node's
// local timezone matching UTC (true on Vercel prod, not guaranteed
// elsewhere), and the setHours/getUTCHours dance hid a whole class of
// off-by-one-day bugs. The pipeline (Day 2G) now ships a clean BDT
// wall-clock string per post; use it when present and keep the legacy
// math as a fallback for pre-Day-2G rows that never got the column.
export function bdt(iso: string): Date {
  if (!iso) return new Date(NaN);

  // Day 2N preferred path: already-BDT wall clock, no offset needed.
  // Accepts "2026-04-16T21:01:42+06:00" or naive "2026-04-16T21:01:42".
  // Heuristic: any "+06:00" suffix means the pipeline already shifted.
  if (iso.includes("+06:00") || iso.includes("+0600")) {
    // Strip the offset and parse as-if local to the current runtime, so
    // getHours()/getDay() return the BDT wall clock regardless of where
    // the server runs.
    const naive = iso.replace(/([+-]\d{2}):?\d{2}$/, "");
    return new Date(naive);
  }

  // Legacy path: UTC FB timestamp ("...+0000" or "...Z"). Shift the UTC
  // hours by +6 and store that back as local time. Works in UTC runtime
  // (Vercel prod); getHours returns the BDT hour after the setHours call.
  const d = new Date(iso.replace(/\+0000/, "Z"));
  d.setHours(d.getUTCHours() + 6);
  return d;
}

export function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Monday 00:00 of the BDT week containing `d`.
 *
 * IMPORTANT: caller MUST pass a BDT-shifted Date (`bdt(iso)` for posts,
 * `bdtNow()` for "now"). `getDay()` reads the runtime's local-time day-of-week,
 * so a raw UTC Date will produce a UTC Monday on Vercel — which can be
 * 6 hours off the BDT Monday. Latent bug if you pass `new Date()` directly.
 */
export function startOfWeekBDT(d: Date): Date {
  const dd = new Date(d);
  const dow = dd.getDay(); // 0 = Sun
  const diff = dow === 0 ? 6 : dow - 1; // Monday-start weeks
  dd.setDate(dd.getDate() - diff);
  dd.setHours(0, 0, 0, 0);
  return dd;
}

/**
 * "Now" in BDT wall-clock as a Date whose local-time methods return BDT values.
 *
 * Mirrors the convention of `bdt(iso)`: a Date object whose `getFullYear()` /
 * `getMonth()` / `getDate()` / `getHours()` etc. return Bangladesh-time
 * values, regardless of the runtime's actual timezone.
 *
 * Why this exists: every range picker on the dashboard ("Last 7 days",
 * "Last 30 days") uses `daysAgo(n)` to compute the range's start. Before this
 * helper, `daysAgo` used `new Date()` which is in the runtime's local timezone
 * — UTC on Vercel prod. Comparing that against `bdt(post.created_time)`
 * (which is BDT-as-local) silently dropped posts created in BDT 00:00–05:59
 * of the start-of-range day. After the helper, both sides of the comparison
 * are BDT-as-local and the boundaries align. See LEARNINGS 2026-04-28.
 *
 * Implementation: format `new Date()` into a YYYY-MM-DDTHH:mm:ss string in
 * Asia/Dhaka via `Intl.DateTimeFormat`, then parse that as a naive local
 * Date — the same trick `bdt()` uses on the pipeline's "+06:00" timestamps.
 */
export function bdtNow(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // en-CA emits 24h time with "00" for midnight. Stitch into ISO-ish naive form.
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

export function daysAgo(n: number): Date {
  // Use BDT wall-clock for "now" so range comparisons against
  // bdt(post.created_time) align. See bdtNow() docstring for why.
  const d = bdtNow();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Core metric computations ───

export function totalInteractions(p: Post): number {
  return (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
}

export function engagementRate(p: Post): number {
  // Day 2U: stop the `|| 1` div-by-zero guard — it produced absurd
  // percentages (e.g. 500% ER on a post with 5 interactions and 0 reach
  // being surfaced in Explore Top-10). Zero reach → zero rate is the
  // honest answer; the post either shouldn't be shown or should be
  // marked as no-reach-data upstream.
  const r = p.unique_views || p.media_views || 0;
  if (r <= 0) return 0;
  return (totalInteractions(p) / r) * 100;
}

export function reach(p: Post): number {
  return p.unique_views || p.media_views || 0;
}

// ─── Stage-0 item 8: classifier confidence down-weighting ───
//
// The classifier self-reports a 0..1 confidence per row (default 0.85 on a
// normal row; 0.5-0.7 on genuinely ambiguous captions). Until now the
// dashboard treated every classification as ground truth, which inflated
// rankings whenever a noisy label landed in a big reach post — e.g. a
// misclassified Student-Success post driving the "top pillar" verdict.
//
// Rule: weights stay in [MIN_CONFIDENCE_FLOOR, 1]. Missing / unparseable
// confidence is treated as 1 (backward compat with pre-v2.3 rows that
// pre-date the field). Below the floor, the weight is clamped — we don't
// want a single 0.2-confidence viral post to completely drop off the
// ranking either; we want it to count for less.

const MIN_CONFIDENCE_FLOOR = 0.3;

// Stage 2 / item 18 (Apr 2026): hard-exclusion floor for "best X" rankings.
// Classifications below this threshold were flagged `_low_confidence` by
// the pipeline (src/classify.py CONFIDENCE_FLOOR = 0.5) — keep them in the
// sheet so reviewers see them, but drop them from rankings so noisy labels
// can't drive recommendations. The soft `confidenceWeight` below (used in
// weighted_reach) stays — it handles the [0.5, 1] band; this filter handles
// the floor.
export const RANKING_CONFIDENCE_FLOOR = 0.5;

/** True if this post should be excluded from "best X" / ranking verdicts. */
export function isLowConfidence(p: Post): boolean {
  const c = p.classifier_confidence;
  if (c === undefined || c === null || Number.isNaN(c)) return false;
  return c < RANKING_CONFIDENCE_FLOOR;
}

export function confidenceWeight(p: Post): number {
  const c = p.classifier_confidence;
  if (c === undefined || c === null || Number.isNaN(c)) return 1;
  if (c >= 1) return 1;
  if (c <= MIN_CONFIDENCE_FLOOR) return MIN_CONFIDENCE_FLOOR;
  return c;
}

/** Reach contribution adjusted by classifier confidence. */
export function weightedReach(p: Post): number {
  return reach(p) * confidenceWeight(p);
}

// ─── Bucket E (items 33-42): derived metrics library ───
//
// These are ratio/rate helpers that compute the "second-order" signals the
// marketing team asks for — virality, discussion quality, CTR proxy, reel
// completion, etc. All derive from fields already present on Post /
// VideoMetric; no new fetches. Safe-divide everywhere (0-reach posts
// return 0, not NaN or Infinity), and item-35 / item-40 return `null`
// when the denominator is unavailable so callers can render "—" instead
// of a misleading 0.

/** Item 33: virality coefficient = shares ÷ reach. 0 when reach is 0. */
export function virality(p: Post): number {
  const r = reach(p);
  if (r <= 0) return 0;
  return (p.shares || 0) / r;
}

/** Item 34: discussion quality = comments ÷ reactions. 0 when reactions is 0. */
export function discussionQuality(p: Post): number {
  const reactions = p.reactions || 0;
  if (reactions <= 0) return 0;
  return (p.comments || 0) / reactions;
}

/**
 * Item 35: sentiment polarity = (love + wow) ÷ (sad + angry).
 *
 * Returns `null` when the denominator is 0 — rather than Infinity — so the
 * caller shows "—" instead of a misleading "infinite positivity" number.
 * When both numerator and denominator are 0 (a post with no love/wow AND
 * no sad/angry), returns 0 because there's no negative signal to react to.
 *
 * Uses Post.sorry + Post.anger (the field names `lib/sheets.ts` writes
 * from the Sad / Angry columns of Raw_Posts).
 */
export function sentimentPolarity(p: Post): number | null {
  const positive = (p.love || 0) + (p.wow || 0);
  const negative = (p.sorry || 0) + (p.anger || 0);
  if (negative <= 0) {
    // No negative reactions at all → polarity is undefined as a ratio.
    // Return 0 when there's also no positive reaction (a dead post), null
    // otherwise (positive-only posts — caller decides how to render).
    return positive > 0 ? null : 0;
  }
  return positive / negative;
}

/** Item 36: CTR proxy = clicks ÷ reach. Most meaningful for link posts. */
export function ctrProxy(p: Post): number {
  const r = reach(p);
  if (r <= 0) return 0;
  return (p.clicks || 0) / r;
}

/**
 * Item 37: cadence gaps in hours between consecutive posts.
 *
 * Sorts posts by `created_time` ascending (BDT) and returns the gap-in-hours
 * between each adjacent pair. Length is `posts.length - 1` (empty array for
 * 0 or 1 posts). Posts with missing / unparseable timestamps are skipped.
 */
export function cadenceGaps(posts: Post[]): number[] {
  const ts: number[] = [];
  for (const p of posts) {
    if (!p.created_time) continue;
    const t = bdt(p.created_time).getTime();
    if (!isFinite(t)) continue;
    ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    gaps.push((ts[i] - ts[i - 1]) / (1000 * 60 * 60));
  }
  return gaps;
}

/**
 * Item 38: format × hour-of-day interaction matrix.
 *
 * Groups posts by (format, publish-hour-BDT). Cell value is the MEAN of
 * the chosen metric across posts in that cell. `n` is the raw post count.
 *
 * Callers typically render this as a small heatmap; apply their own
 * min-N filter when painting so a single-post cell doesn't look confident.
 *
 * metric:
 *  - "reach"     → mean unique reach per post in the cell
 *  - "engagement" → mean engagement rate (totalInteractions ÷ reach × 100)
 */
export type FormatHourMetric = "reach" | "interactions" | "engagement" | "shares";

// Sprint P7 Phase 3 (2026-04-28): page-level multi-metric ranking. Same
// 4-metric set as FormatHourMetric, exposed as a stable type for the
// `<MetricSelector>` component + composite ranking helpers below. Keeps
// the two metric vocabularies aligned — Format×Hour box-level pills and
// page-level pills speak the same language.
export type RankingMetric = FormatHourMetric;

/**
 * Extract a single-metric value from a Post for ranking purposes.
 * Used by the composite ranker below to score individual rows.
 */
export function postMetricValue(p: Post, metric: RankingMetric): number {
  switch (metric) {
    case "reach":        return reach(p);
    case "interactions": return totalInteractions(p);
    case "engagement":   return engagementRate(p);
    case "shares":       return p.shares || 0;
  }
}

/**
 * Composite score for a single row across multiple metrics. Each metric
 * is normalized to its percentile-rank within the supplied population
 * (0..1, higher = better), then averaged with equal weight.
 *
 * Why percentile-rank: raw values across reach (10000s) and engagement
 * rate (0.X%) aren't comparable for averaging. Percentile-rank puts
 * everything on the same 0..1 scale so equal-weight averaging is
 * meaningful.
 *
 * Why this signature: caller computes percentile-rank lookup tables
 * once per metric (not per row) for O(N log N) total instead of O(N²).
 *
 * Usage:
 *   const sortedByMetric: Record<RankingMetric, number[]> = {
 *     reach:        [...posts.map(p => reach(p))].sort((a,b) => a-b),
 *     interactions: ... etc
 *   };
 *   const score = compositeScore(post, ["reach","interactions"], sortedByMetric);
 *
 * Returns 0..1; rows with the highest composite rank highest.
 */
export function compositeScore(
  p: Post,
  metrics: RankingMetric[],
  sortedByMetric: Record<RankingMetric, number[]>,
): number {
  if (metrics.length === 0) return 0;
  let sum = 0;
  for (const m of metrics) {
    const value = postMetricValue(p, m);
    const sorted = sortedByMetric[m] || [];
    if (sorted.length === 0) continue;
    sum += percentileRankIn(value, sorted);
  }
  return sum / metrics.length;
}

/**
 * Percentile rank of `value` in a pre-sorted ascending array. Returns
 * the fraction of array entries strictly less than `value` (0 = below
 * everything, 1 = above everything). Tied values get fractional credit
 * for the lower-rank position.
 *
 * Implements binary search for O(log N) per lookup. Caller is
 * responsible for pre-sorting; this helper does NOT sort.
 */
export function percentileRankIn(value: number, sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  // Binary search for first index >= value.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / n;
}

/**
 * Build the sorted-by-metric lookup tables a composite ranker needs.
 * Run this ONCE per page render (not per row) for O(N log N) total.
 */
export function buildMetricSorts(
  posts: Post[],
  metrics: RankingMetric[],
): Record<RankingMetric, number[]> {
  const out: Partial<Record<RankingMetric, number[]>> = {};
  for (const m of metrics) {
    out[m] = posts.map((p) => postMetricValue(p, m)).sort((a, b) => a - b);
  }
  // Fill any unrequested keys with empty arrays so the type stays clean.
  for (const opt of ["reach", "interactions", "engagement", "shares"] as RankingMetric[]) {
    if (!out[opt]) out[opt] = [];
  }
  return out as Record<RankingMetric, number[]>;
}

/**
 * Sort posts by composite score across `metrics`, descending. When
 * `metrics` has length 1, falls back to a direct value sort (cheaper +
 * preserves exact ordering instead of percentile-bucketed). When
 * length 0, returns posts unchanged.
 */
export function sortByComposite(
  posts: Post[],
  metrics: RankingMetric[],
): Post[] {
  if (metrics.length === 0) return posts;
  if (metrics.length === 1) {
    const m = metrics[0];
    return [...posts].sort((a, b) => postMetricValue(b, m) - postMetricValue(a, m));
  }
  const sorted = buildMetricSorts(posts, metrics);
  // Decorate, sort, undecorate (Schwartzian) so we don't recompute the
  // composite per comparison.
  const decorated = posts.map((p) => [compositeScore(p, metrics, sorted), p] as const);
  decorated.sort((a, b) => b[0] - a[0]);
  return decorated.map(([_, p]) => p);
}

export function formatHourMatrix(
  posts: Post[],
  metric: FormatHourMetric
): Record<string, Record<number, { mean: number; n: number }>> {
  const buckets: Record<string, Record<number, number[]>> = {};
  for (const p of posts) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    if (isNaN(d.getTime())) continue;
    const hour = d.getHours();
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const fmt = (p.format || "").trim() || "Unknown";
    if (!buckets[fmt]) buckets[fmt] = {};
    if (!buckets[fmt][hour]) buckets[fmt][hour] = [];
    const v =
      metric === "reach"
        ? reach(p)
        : metric === "interactions"
          ? totalInteractions(p)
          : metric === "shares"
            ? (p.shares || 0)
            : engagementRate(p);
    buckets[fmt][hour].push(v);
  }
  const out: Record<string, Record<number, { mean: number; n: number }>> = {};
  for (const [fmt, hours] of Object.entries(buckets)) {
    out[fmt] = {};
    for (const [h, vals] of Object.entries(hours)) {
      const mean = vals.length
        ? vals.reduce((s, x) => s + x, 0) / vals.length
        : 0;
      out[fmt][Number(h)] = { mean, n: vals.length };
    }
  }
  return out;
}

/**
 * Item 39: save-to-reach ratio.
 *
 * SCOPED DOWN — `Saves` is not currently captured from the Graph API
 * (see `src/fetch.py` / `src/sheets.py` — no "Saves" column on Raw_Posts,
 * and `Post` on the dashboard side has no `saves` field). This function
 * exists so callers compile now and start returning real values once the
 * pipeline adds the column. Today it returns 0 everywhere.
 *
 * TODO(bucket-e-39): wire up `Post.saves` once `Raw_Posts.Saves` lands
 *   (Graph API `post_activity_unique` with type=saved action).
 */
export function saveRate(p: Post): number {
  const saves = (p as Post & { saves?: number }).saves ?? 0;
  const r = reach(p);
  if (r <= 0) return 0;
  return saves / r;
}

/**
 * Item 40: reel completion rate = complete_views ÷ reel_plays.
 *
 * Only applies to reels — lives on VideoMetric, not Post — so the helper
 * takes a VideoMetric-shaped object. Returns `null` for non-reels or when
 * plays is 0 (so the caller renders "—" instead of "0.0%" on a reel
 * that never played).
 *
 * NOTE: Meta's "Complete Views" bucket is not populated for modern reels
 * (see the comments in `app/reels/page.tsx`). For reels where it IS
 * populated (older video posts + some reels), this ratio is meaningful;
 * otherwise the Reels page's per-second retention curve is more honest.
 */
export function completionRate(
  v: { is_reel: boolean; complete_views: number; reel_plays: number; total_views?: number }
): number | null {
  if (!v.is_reel) return null;
  const denom = v.reel_plays || v.total_views || 0;
  if (denom <= 0) return null;
  if (!v.complete_views) return 0;
  return v.complete_views / denom;
}

/**
 * Item 42: composite north-star score.
 *
 * Weighted blend of the high-intent interactions (saves + shares * 1.5)
 * normalized to reach. Shares are weighted 1.5× because a share is a
 * public recommendation that expands the audience beyond the current
 * follower base — it's worth more than a save in organic growth terms.
 *
 * DMs are INTENTIONALLY EXCLUDED for now — the `dms_generated` signal is
 * only available via the Meta Business Suite API, not the standard Graph
 * API this pipeline uses. See `DECISIONS.md` (2026-04-21 "Bucket E item 42
 * north-star excludes DMs pending MBS access") — when MBS lands we'll
 * re-introduce the `+ dms * 2.0` term and break historical comparability
 * one more time.
 *
 * Saves currently contribute 0 on all posts (item 39 is scope-down;
 * `Raw_Posts.Saves` isn't ingested yet). Once it lands, the score
 * automatically picks it up without a code change.
 */
export function northStarScore(p: Post): number {
  const saves = (p as Post & { saves?: number }).saves ?? 0;
  const shares = p.shares || 0;
  const r = reach(p);
  if (r <= 0) return 0;
  // Normalize to a small decimal (e.g., 0.01 = 1% of reach is high-intent).
  return (saves + shares * 1.5) / r;
}

// ─── Filtering ───

export type PostFilters = {
  start?: Date;
  end?: Date;
  pillars?: string[];
  formats?: string[];
  audiences?: string[];
  entities?: string[];          // legacy v1 — filters featured_entity
  spotlightTypes?: string[];    // v2 — Teacher | Product | Program | Campaign
  spotlightNames?: string[];    // v2 — canonical entity name
  hooks?: string[];
  visualStyles?: string[];
  funnelStages?: string[];
  languages?: string[];
};

export function filterPosts(posts: Post[], f: PostFilters): Post[] {
  return posts.filter((p) => {
    if (!p.created_time) return false;
    const d = bdt(p.created_time);
    if (f.start && d < f.start) return false;
    if (f.end && d > f.end) return false;
    if (f.pillars?.length && !f.pillars.includes(p.content_pillar || "")) return false;
    if (f.formats?.length && !f.formats.includes(p.format || "")) return false;
    if (f.audiences?.length && !f.audiences.includes(p.primary_audience || "")) return false;
    if (f.entities?.length && !f.entities.includes(p.featured_entity || "")) return false;
    if (f.spotlightTypes?.length && !f.spotlightTypes.includes(p.spotlight_type || "")) return false;
    if (f.spotlightNames?.length && !f.spotlightNames.includes(p.spotlight_name || "")) return false;
    if (f.hooks?.length && !f.hooks.includes(p.hook_type || "")) return false;
    if (f.visualStyles?.length && !f.visualStyles.includes(p.visual_style || "")) return false;
    if (f.funnelStages?.length && !f.funnelStages.includes(p.funnel_stage || "")) return false;
    if (f.languages?.length && !f.languages.includes(p.language || "")) return false;
    return true;
  });
}

// ─── KPI bundles ───

export type KpiBundle = {
  posts: number;
  total_reach: number;
  total_interactions: number;
  total_shares: number;
  total_clicks: number;
  avg_engagement_rate: number;
  avg_reach_per_post: number;
};

export function computeKpis(posts: Post[]): KpiBundle {
  const totalReach = posts.reduce((s, p) => s + reach(p), 0);
  const totalInt = posts.reduce((s, p) => s + totalInteractions(p), 0);
  const totalShares = posts.reduce((s, p) => s + (p.shares || 0), 0);
  const totalClicks = posts.reduce((s, p) => s + (p.clicks || 0), 0);
  const avgER = totalReach > 0 ? (totalInt / totalReach) * 100 : 0;
  return {
    posts: posts.length,
    total_reach: totalReach,
    total_interactions: totalInt,
    total_shares: totalShares,
    total_clicks: totalClicks,
    avg_engagement_rate: avgER,
    avg_reach_per_post: posts.length ? Math.round(totalReach / posts.length) : 0,
  };
}

// ─── Group by dimension ───

export function groupBy<K extends keyof Post>(
  posts: Post[],
  dim: K
): Record<string, Post[]> {
  const out: Record<string, Post[]> = {};
  for (const p of posts) {
    const key = String(p[dim] || "Unknown");
    (out[key] = out[key] || []).push(p);
  }
  return out;
}

export type GroupStatRow = {
  key: string;
  count: number;
  posts: number;
  total_reach: number;
  total_interactions: number;
  total_shares: number;
  total_clicks: number;
  avg_engagement_rate: number;
  avg_reach_per_post: number;
  // Day 2O: CI-based ranking fields. Use `reach_summary.lowerBound95` to rank
  // "best X" selections; a group with n=1 has lowerBound95 = -Infinity and
  // will never win, so a single viral post can't promote its pillar/format/
  // teacher into a recommendation.
  reach_summary: Summary;
  er_summary: Summary;
  // Stage-0 item 8 (Apr 2026): classifier-confidence-weighted totals. Use
  // these for "best X" rankings instead of `total_reach`/`avg_reach_per_post`
  // when the label being grouped on is classifier-derived (pillar, funnel
  // stage, caption tone, hook type, etc.). Raw reach is kept for display.
  weighted_reach: number;          // sum of reach * confidenceWeight
  avg_weighted_reach_per_post: number;
  avg_confidence: number;          // 0..1; 1.0 on pre-v2.3 rows (no field)
};

export function groupStats(posts: Post[], dim: keyof Post): GroupStatRow[] {
  const groups = groupBy(posts, dim);
  return Object.entries(groups)
    .map(([key, items]) => {
      const k = computeKpis(items);
      const reachValues = items.map((p) => reach(p));
      const erValues = items.map((p) => {
        const r = reach(p);
        return r ? (totalInteractions(p) / r) * 100 : 0;
      });
      const weightedSum = items.reduce((s, p) => s + weightedReach(p), 0);
      const confSum = items.reduce((s, p) => s + confidenceWeight(p), 0);
      const avgConf = items.length ? confSum / items.length : 0;
      return {
        key,
        count: items.length,
        ...k,
        reach_summary: summarize(reachValues),
        er_summary: summarize(erValues),
        weighted_reach: Math.round(weightedSum),
        avg_weighted_reach_per_post: items.length
          ? Math.round(weightedSum / items.length)
          : 0,
        avg_confidence: Number(avgConf.toFixed(3)),
      };
    })
    .sort((a, b) => b.total_reach - a.total_reach);
}

// ─── Top / bottom performers ───

export function topByReach(posts: Post[], n = 10): Post[] {
  return [...posts].sort((a, b) => reach(b) - reach(a)).slice(0, n);
}

export function topByEngagement(posts: Post[], minReach = 500, n = 10): Post[] {
  return [...posts]
    .filter((p) => reach(p) >= minReach)
    .sort((a, b) => engagementRate(b) - engagementRate(a))
    .slice(0, n);
}

// ─── Daily trend aggregation ───

export function dailyReach(posts: Post[]): { date: string; reach: number; posts: number }[] {
  const byDay: Record<string, { reach: number; posts: number }> = {};
  for (const p of posts) {
    if (!p.created_time) continue;
    const d = dateStr(bdt(p.created_time));
    byDay[d] = byDay[d] || { reach: 0, posts: 0 };
    byDay[d].reach += reach(p);
    byDay[d].posts += 1;
  }
  return Object.entries(byDay)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function followerTrajectory(daily: DailyMetric[]): { date: string; followers: number; net_change: number }[] {
  return [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      followers: d.followers_total,
      net_change: (d.new_follows || 0) - (d.unfollows || 0),
    }));
}

// ─── Week-over-week delta ───

export function wowDelta(current: number, previous: number): { delta: number; pct: number } {
  const delta = current - previous;
  const pct = previous > 0 ? (delta / previous) * 100 : 0;
  return { delta, pct };
}

// ─── Timing heatmap: day-of-week x hour ───

export function timingHeatmap(posts: Post[]): { day: string; hour: number; reach: number; posts: number }[] {
  const data: Record<string, { reach: number; posts: number }> = {};
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const p of posts) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const key = `${days[d.getDay()]}-${d.getHours()}`;
    data[key] = data[key] || { reach: 0, posts: 0 };
    data[key].reach += reach(p);
    data[key].posts += 1;
  }
  return Object.entries(data).map(([k, v]) => {
    const [day, hour] = k.split("-");
    return { day, hour: Number(hour), reach: v.reach, posts: v.posts };
  });
}

// ─── Red flag detection ───

export type RedFlag = {
  severity: "high" | "medium" | "low";
  category: string;
  headline: string;
  detail: string;
};

export function detectRedFlags(posts: Post[], daily: DailyMetric[]): RedFlag[] {
  const flags: RedFlag[] = [];
  if (daily.length < 14) return flags;

  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const prev7 = sorted.slice(-14, -7);

  // Unfollow spike
  const avgUnfollows7 = last7.reduce((s, d) => s + (d.unfollows || 0), 0) / 7;
  const avgUnfollows30 = sorted.slice(-30).reduce((s, d) => s + (d.unfollows || 0), 0) / Math.min(30, sorted.length);
  if (avgUnfollows7 > avgUnfollows30 * 1.5 && avgUnfollows30 > 0) {
    flags.push({
      severity: "high",
      category: "Retention",
      headline: `Unfollows spiked ${Math.round(((avgUnfollows7 / avgUnfollows30) - 1) * 100)}% above 30d average`,
      detail: `Last 7 days: ${Math.round(avgUnfollows7)}/day average unfollows vs ${Math.round(avgUnfollows30)}/day over 30 days. Review last week's content for negative signals.`,
    });
  }

  // Reach collapse
  const avgReach7 = last7.reduce((s, d) => s + (d.media_views || 0), 0) / 7;
  const avgReach14 = sorted.slice(-14).reduce((s, d) => s + (d.media_views || 0), 0) / Math.min(14, sorted.length);
  if (avgReach7 < avgReach14 * 0.7 && avgReach14 > 0) {
    flags.push({
      severity: "high",
      category: "Reach",
      headline: `Reach dropped ${Math.round((1 - (avgReach7 / avgReach14)) * 100)}% vs 14d average`,
      detail: `Last 7 days averaging ${Math.round(avgReach7).toLocaleString()} views/day, down from ${Math.round(avgReach14).toLocaleString()}. Check content mix and posting cadence.`,
    });
  }

  // Viral opportunity (post >3x avg reach)
  if (posts.length > 0) {
    const avgPostReach = posts.reduce((s, p) => s + reach(p), 0) / posts.length;
    const viral = posts.filter((p) => reach(p) > avgPostReach * 3);
    if (viral.length > 0) {
      const top = viral.sort((a, b) => reach(b) - reach(a))[0];
      flags.push({
        severity: "medium",
        category: "Opportunity",
        headline: `Viral post detected: ${Math.round(reach(top)).toLocaleString()} unique reach (${Math.round(reach(top) / avgPostReach)}x avg)`,
        detail: `Post: ${top.message.slice(0, 80)}... Consider promoting or adapting for other platforms.`,
      });
    }
  }

  return flags;
}

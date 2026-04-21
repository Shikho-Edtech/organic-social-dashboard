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

export function startOfWeekBDT(d: Date): Date {
  const dd = new Date(d);
  const dow = dd.getDay(); // 0 = Sun
  const diff = dow === 0 ? 6 : dow - 1; // Monday-start weeks
  dd.setDate(dd.getDate() - diff);
  dd.setHours(0, 0, 0, 0);
  return dd;
}

export function daysAgo(n: number): Date {
  const d = new Date();
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

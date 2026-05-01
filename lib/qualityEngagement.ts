// Sprint P7 v4.15 (2026-05-02): Quality Engagement north-star CANDIDATE.
//
// Formula: Shares × 2 + Comments × 1.
//
// Reactions are excluded because they're a one-tap, low-effort signal that
// behaves as a reach proxy. Shares are weighted 2× because they extend
// organic reach (algorithm reward + endorsement risk to the sharer's feed).
// Comments are weighted 1× because they capture depth-of-attention but are
// somewhat gameable via "tag a friend" / "comment to win" hooks.
//
// This is a CANDIDATE metric. The dashboard displays it in parallel with
// reach for 4-8 weeks via the Today page + Diagnosis verdict header.
// `North_Star_Trace` log accumulates both metrics + a manual team verdict
// per week. After enough data we decide which one becomes the canonical
// scoring anchor (a Tier 5+ rewrite of priors / forecasts / Outcomes per
// `docs/PLAN_ALGORITHM_AUDIT.md`). Until then nothing in the underlying
// scoring layer changes — Outcomes still scores reach, priors are still
// reach distributions. This is a DISPLAY-LAYER experiment.

import type { Post } from "@/lib/types";

export const SHARES_WEIGHT = 2;
export const COMMENTS_WEIGHT = 1;

/** Compute Quality Engagement for a single post. */
export function qualityEngagementForPost(p: Post): number {
  const shares = Number((p as any).shares_count || 0);
  const comments = Number((p as any).comments_count || 0);
  return shares * SHARES_WEIGHT + comments * COMMENTS_WEIGHT;
}

/** Sum Quality Engagement over an array of posts. */
export function totalQualityEngagement(posts: Post[]): number {
  return posts.reduce((acc, p) => acc + qualityEngagementForPost(p), 0);
}

/** Sum raw shares across posts. */
export function totalShares(posts: Post[]): number {
  return posts.reduce((acc, p) => acc + Number((p as any).shares_count || 0), 0);
}

/** Sum raw comments across posts. */
export function totalComments(posts: Post[]): number {
  return posts.reduce((acc, p) => acc + Number((p as any).comments_count || 0), 0);
}

/** Sum reach across posts (post_total_media_view_unique). */
export function totalReach(posts: Post[]): number {
  return posts.reduce((acc, p) => {
    const r =
      Number((p as any).reach || 0) ||
      Number((p as any).post_total_media_view_unique || 0) ||
      0;
    return acc + r;
  }, 0);
}

/** Compute % delta between current and prior. Returns null when prior is 0. */
export function wowDelta(current: number, prior: number): number | null {
  if (!prior) return null;
  return ((current - prior) / prior) * 100;
}

/** Format a WoW delta for display: "+24%" / "-8%" / "—" when null. */
export function formatWowDelta(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}%`;
}

/** Color token for a WoW delta. Neutral within ±5% noise band. */
export function deltaColorClass(delta: number | null): string {
  if (delta === null) return "text-ink-muted";
  if (Math.abs(delta) < 5) return "text-ink-muted";
  return delta > 0 ? "text-brand-green" : "text-brand-red";
}

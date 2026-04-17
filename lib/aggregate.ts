// Aggregation and filtering helpers for dashboard views
import type { Post, DailyMetric } from "./types";

// ─── Date helpers (Bangladesh time, UTC+6) ───

export function bdt(iso: string): Date {
  // Parse FB created_time (e.g. "2026-04-16T15:01:42+0000") and shift to BDT
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
  const reach = p.unique_views || p.media_views || 1;
  return (totalInteractions(p) / reach) * 100;
}

export function reach(p: Post): number {
  return p.unique_views || p.media_views || 0;
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

export function groupStats(posts: Post[], dim: keyof Post) {
  const groups = groupBy(posts, dim);
  return Object.entries(groups)
    .map(([key, items]) => {
      const k = computeKpis(items);
      return { key, count: items.length, ...k };
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

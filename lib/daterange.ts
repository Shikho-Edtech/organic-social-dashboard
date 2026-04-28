// Shared date-range helper for all pages
// Parses ?range= URL params into a { start, end, label } bundle.

import { bdtNow } from "./aggregate";

export type RangeSpec = {
  start: Date;
  end: Date;
  label: string;
  key: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysAgo(n: number): Date {
  // Bucket P6F (2026-04-28): use BDT wall-clock for "now" so the
  // resulting start-of-range aligns with bdt(post.created_time). Was
  // using `new Date()` (UTC on Vercel), which silently excluded posts
  // created BDT 00:00–05:59 of the start day from "Last 7 days" etc.
  const d = bdtNow();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRangeLabel(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} → ${endStr}`;
}

/**
 * Calendar-day span of a resolved range (end 23:59 minus start 00:00, floored).
 *
 * Centralized because three pages (Engagement, Strategy, Timing) each computed
 * their own rangeDays with a different formula — `daysBetween + 1`, `round`,
 * `floor` — which meant "Last 30 days" hit different `minPostsForRange`
 * thresholds on different pages (15-post gate vs 10-post gate). Use this helper
 * everywhere so a single range selection produces one consistent reliability
 * gate across the whole app.
 */
export function rangeDays(range: RangeSpec): number {
  const ms = range.end.getTime() - range.start.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}

export function resolveRange(searchParams: Record<string, string | string[] | undefined>): RangeSpec {
  // bdtNow() returns a Date whose local-time methods reflect BDT wall-clock,
  // matching the convention of bdt(iso). Used as `now` so MTD/YTD month +
  // year boundaries line up with the BDT calendar an operator would expect.
  const now = bdtNow();
  const key = (searchParams.range as string) || "30d";

  let start: Date;
  let end: Date = endOfDay(now);

  if (key === "7d") start = daysAgo(7);
  else if (key === "30d") start = daysAgo(30);
  else if (key === "90d") start = daysAgo(90);
  else if (key === "mtd") start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  else if (key === "ytd") start = startOfDay(new Date(now.getFullYear(), 0, 1));
  else if (key === "all") start = new Date("2024-01-01");
  else if (key === "custom") {
    const s = searchParams.start as string;
    const e = searchParams.end as string;
    start = s ? startOfDay(new Date(s)) : daysAgo(30);
    end = e ? endOfDay(new Date(e)) : endOfDay(now);
  } else {
    start = daysAgo(30);
  }

  return {
    start,
    end,
    key,
    label: formatRangeLabel(start, end),
  };
}

export { formatDate };

import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import { filterPosts, dailyReach, reach, bdt } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function TrendsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

  const [posts, daily, runStatus] = await Promise.all([getPosts(), getDailyMetrics(), getRunStatus()]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Daily posting volume
  const byDay: Record<string, number> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const volumeData = Object.entries(byDay)
    .map(([date, v]) => ({ label: date.slice(5), value: v }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Daily reach
  const reachData = dailyReach(inRange).map((d) => ({ date: d.date.slice(5), value: d.reach }));

  // Weekly engagement rate
  const weekBuckets: Record<string, { reach: number; eng: number }> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const weekKey = `${d.getFullYear()}-W${String(getWeek(d)).padStart(2, "0")}`;
    const r = reach(p);
    const e = (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
    weekBuckets[weekKey] = weekBuckets[weekKey] || { reach: 0, eng: 0 };
    weekBuckets[weekKey].reach += r;
    weekBuckets[weekKey].eng += e;
  }
  const weeklyEng = Object.entries(weekBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ date: formatWeekRange(week), value: v.reach > 0 ? (v.eng / v.reach) * 100 : 0 }));

  // Weekly shares
  const weekShares: Record<string, number> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const weekKey = `${d.getFullYear()}-W${String(getWeek(d)).padStart(2, "0")}`;
    weekShares[weekKey] = (weekShares[weekKey] || 0) + (p.shares || 0);
  }
  const sharesData = Object.entries(weekShares)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ label: formatWeekRange(k), value: v }));

  // Sprint P6: dropped the "Weekly at-a-glance" 2x2 sparkline grid. The
  // full-size charts below cover the same signal with more context, and
  // users flagged the sparkline strip as clutter that duplicated signals
  // already on /overview's reach trend + biggest movers.

  return (
    <div>
      <PageHeader title="Trends" subtitle="Time-based patterns across the period" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Daily Posting Volume"
          kind="observed"
          subtitle="Posts published per day"
          definition="Count of posts published on each calendar day (BDT). Gaps mean no posts were published that day."
          caption="Number of posts published each day in the selected period."
        >
          <BarChartBase data={volumeData} color="#3F4FA2" metricName="Posts" valueAxisLabel="Posts published" categoryAxisLabel="Date (MM-DD)" />
        </ChartCard>
        <ChartCard
          title="Daily Reach"
          kind="observed"
          subtitle="Unique reach per day"
          definition="Sum of post-level unique reach for posts published that day. Not lifetime page reach — reach attributed to posts. Spikes typically mean a single post went viral."
          caption="Daily unique reach — spikes often indicate viral or boosted content."
        >
          <TrendChart data={reachData} color="#304090" variant="area" metricName="Reach" valueAxisLabel="Unique reach" />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Weekly Engagement Rate"
          kind="derived"
          subtitle="Interactions per unique reach"
          definition="For each ISO week: (total reactions + comments + shares) ÷ (total unique reach). This is reach-weighted, not averaged per post, so a few high-reach posts dominate the signal — which is what you want."
          caption="Week-over-week stability indicates healthy audience relationship. Big drops warrant investigating what changed."
        >
          <TrendChart
            data={weeklyEng}
            color="#C02080"
            variant="line"
            valueFormat="percent1"
            metricName="Engagement rate"
            valueAxisLabel="Engagement rate"
          />
        </ChartCard>
        <ChartCard
          title="Weekly Shares"
          kind="observed"
          subtitle="Share volume over time"
          definition="Total shares across all posts published in each ISO week."
          caption="Shares are the strongest virality signal — they expand reach beyond your existing audience."
        >
          <BarChartBase data={sharesData} color="#E0A010" metricName="Shares" valueAxisLabel="Shares" />
        </ChartCard>
      </div>
    </div>
  );
}

function getWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// Sprint P6: user feedback said "W17" / "W12" axis labels are unreadable —
// users don't memorize ISO week numbers. Convert "2026-W17" → "Apr 20–26"
// (short month + date range). When the week spans two months, format as
// "Apr 28–May 4". Monday anchor follows ISO 8601 (week starts Monday;
// week 1 contains first Thursday of the year).
function formatWeekRange(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return weekKey;
  const year = parseInt(m[1], 10);
  const wk = parseInt(m[2], 10);
  // Jan 4 is guaranteed to fall in ISO week 1. Work back to that week's
  // Monday, then forward (wk-1) weeks to get this week's Monday.
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const mon = new Date(year, 0, 4 - jan4Dow + (wk - 1) * 7);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (mon.getMonth() === sun.getMonth()) {
    return `${MONTHS[mon.getMonth()]} ${mon.getDate()}\u2013${sun.getDate()}`;
  }
  return `${MONTHS[mon.getMonth()]} ${mon.getDate()}\u2013${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
}

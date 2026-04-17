import { getPosts, getDailyMetrics } from "@/lib/sheets";
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

  const [posts, daily] = await Promise.all([getPosts(), getDailyMetrics()]);
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
    .map(([week, v]) => ({ date: week.slice(5), value: v.reach > 0 ? (v.eng / v.reach) * 100 : 0 }));

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
    .map(([k, v]) => ({ label: k.slice(5), value: v }));

  return (
    <div>
      <PageHeader title="Trends" subtitle="Time-based patterns across the period" dateLabel={range.label} />

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Daily Posting Volume" subtitle="Posts published per day" caption="Number of posts published each day in the selected period.">
          <BarChartBase data={volumeData} color="#06b6d4" />
        </ChartCard>
        <ChartCard title="Daily Reach" subtitle="Unique reach per day" caption="Daily unique reach — spikes often indicate viral or boosted content.">
          <TrendChart data={reachData} color="#10b981" variant="area" />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Weekly Engagement Rate" subtitle="Interactions per unique reach" caption="Interactions ÷ unique reach. Week-over-week stability indicates healthy audience relationship.">
          <TrendChart
            data={weeklyEng}
            color="#ec4899"
            variant="line"
            valueFormat={(v) => v.toFixed(1) + "%"}
          />
        </ChartCard>
        <ChartCard title="Weekly Shares" subtitle="Share volume over time" caption="Shares are the strongest virality signal — they expand reach beyond your existing audience.">
          <BarChartBase data={sharesData} color="#f59e0b" />
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

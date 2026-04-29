import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import { filterPosts, dailyMetricTrend, postMetricValue, bdt, type RankingMetric } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import MultiLineTrendChart, { type MultiSeries } from "@/components/MultiLineTrendChart";
import BarChartBase from "@/components/BarChart";
import MetricSelector, { parseMetricParam } from "@/components/MetricSelector";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function TrendsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  // Sprint P7 Phase 3 + QA pass (2026-04-28): page-level metric pills
  // re-key the daily + weekly trend charts. "Daily Posting Volume" is
  // a COUNT chart and stays invariant (the spec philosophy says
  // categorical/count things don't follow the metric).
  const activeMetrics = parseMetricParam(searchParams.metric);
  const primaryMetric: RankingMetric = activeMetrics[0];
  const isComposite = activeMetrics.length > 1;
  const metricLabelFull: Record<RankingMetric, string> = {
    reach: "Reach",
    interactions: "Interactions",
    engagement: "Engagement Rate",
    shares: "Shares",
  };
  const metricLabelLower: Record<RankingMetric, string> = {
    reach: "reach",
    interactions: "interactions",
    engagement: "engagement rate",
    shares: "shares",
  };

  const [posts, daily, runStatus] = await Promise.all([getPosts(), getDailyMetrics(), getRunStatus()]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Daily posting volume — COUNT, unchanged across metrics.
  const byDay: Record<string, number> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const volumeData = Object.entries(byDay)
    .map(([date, v]) => ({ label: date.slice(5), value: v }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Daily metric trend — sums or averages depending on metric semantic.
  // dailyMetricTrend returns {date, value, posts}; we slice the date
  // for the MM-DD axis label.
  const dailyData = dailyMetricTrend(inRange, primaryMetric).map((d) => ({
    date: d.date.slice(5),
    value: d.value,
  }));
  // v3.5 (2026-04-29): multi-line composite series for 2+ metrics.
  const METRIC_COLORS: Record<RankingMetric, string> = {
    reach: "#304090",
    interactions: "#C02080",
    engagement: "#1A8E78",
    shares: "#E0A010",
  };
  const compositeDailySeries: MultiSeries[] = isComposite
    ? activeMetrics.map((m) => ({
        name: metricLabelFull[m],
        color: METRIC_COLORS[m],
        data: dailyMetricTrend(inRange, m).map((d) => ({
          date: d.date.slice(5),
          value: d.value,
        })),
        formatter: (v: number) =>
          m === "engagement" ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString(),
      }))
    : [];

  // Weekly bucket — for engagement rate it's reach-weighted (Σ ints ÷
  // Σ reach × 100). For other metrics it's a simple sum per ISO week.
  const weekBuckets: Record<string, { value: number; reach: number; ints: number; n: number }> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const weekKey = `${d.getFullYear()}-W${String(getWeek(d)).padStart(2, "0")}`;
    weekBuckets[weekKey] = weekBuckets[weekKey] || { value: 0, reach: 0, ints: 0, n: 0 };
    const v = postMetricValue(p, primaryMetric);
    if (primaryMetric === "engagement") {
      // For ER, accumulate reach + interactions for reach-weighted aggregation
      const r = postMetricValue(p, "reach");
      const i = postMetricValue(p, "interactions");
      weekBuckets[weekKey].reach += r;
      weekBuckets[weekKey].ints += i;
    } else {
      weekBuckets[weekKey].value += v;
    }
    weekBuckets[weekKey].n += 1;
  }
  const weeklyData = Object.entries(weekBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({
      label: formatWeekRange(week),
      value:
        primaryMetric === "engagement"
          ? (v.reach > 0 ? (v.ints / v.reach) * 100 : 0)
          : v.value,
    }));

  return (
    <div>
      <PageHeader title="Trends" subtitle="Time-based patterns across the period" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />
      <MetricSelector basePath="/trends" active={activeMetrics} preserve={searchParams} />

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Daily Posting Volume"
          kind="observed"
          subtitle="Posts published per day"
          definition="Count of posts published on each calendar day (BDT). Gaps mean no posts were published that day. Invariant to the active ranking metric — this is a count, not a metric."
          caption="Number of posts published each day in the selected period."
        >
          <BarChartBase data={volumeData} color="#3F4FA2" metricName="Posts" valueAxisLabel="Posts published" categoryAxisLabel="Date (MM-DD)" />
        </ChartCard>
        <ChartCard
          title={
            isComposite
              ? `Composite Daily Trend (${activeMetrics.length} metrics, normalized)`
              : `Daily ${metricLabelFull[primaryMetric]}`
          }
          kind="observed"
          subtitle={
            isComposite
              ? "Each line normalized to % of its own peak — shapes are comparable, raw values shown in tooltip"
              : primaryMetric === "engagement"
                ? "Mean engagement rate per day"
                : `${primaryMetric === "reach" ? "Unique " : ""}${metricLabelLower[primaryMetric]} per day`
          }
          definition={
            isComposite
              ? "Multi-series trend with per-series % of peak normalization. Hover any point to see raw values per metric."
              : primaryMetric === "engagement"
                ? "Mean post-level engagement rate per day. Engagement rate = interactions ÷ reach × 100."
                : `Sum of post-level ${metricLabelLower[primaryMetric]} for posts published that day. Spikes typically mean a single post performed unusually well.`
          }
          caption={
            isComposite
              ? "Shapes diverge → metrics tell different stories that day. Shapes track → metrics correlate."
              : `Daily ${metricLabelLower[primaryMetric]} — spikes often indicate viral or boosted content.`
          }
        >
          {isComposite ? (
            <MultiLineTrendChart series={compositeDailySeries} />
          ) : (
            <TrendChart
              data={dailyData}
              color="#304090"
              variant="area"
              metricName={metricLabelFull[primaryMetric]}
              valueAxisLabel={metricLabelFull[primaryMetric]}
              valueFormat={primaryMetric === "engagement" ? "percent1" : undefined}
            />
          )}
        </ChartCard>
      </div>

      <div className="mb-6">
        <ChartCard
          title={`Weekly ${metricLabelFull[primaryMetric]}${isComposite ? " (primary metric)" : ""}`}
          kind="derived"
          subtitle={
            primaryMetric === "engagement"
              ? "Reach-weighted engagement rate per ISO week"
              : `Total ${metricLabelLower[primaryMetric]} per ISO week`
          }
          definition={
            primaryMetric === "engagement"
              ? "For each ISO week: (Σ reactions + comments + shares) ÷ (Σ unique reach) × 100. Reach-weighted (not averaged per post) so a few high-reach posts dominate the signal — which is what you want."
              : `For each ISO week: total ${metricLabelLower[primaryMetric]} across posts published that week.`
          }
          caption={
            primaryMetric === "engagement"
              ? "Week-over-week stability indicates healthy audience relationship. Big drops warrant investigating what changed."
              : primaryMetric === "shares"
                ? "Shares are the strongest virality signal — they expand reach beyond the existing audience."
                : `Weekly ${metricLabelLower[primaryMetric]} — useful for spotting multi-week trends that daily noise might obscure.`
          }
        >
          {primaryMetric === "engagement" ? (
            <TrendChart
              data={weeklyData.map((d) => ({ date: d.label, value: d.value }))}
              color="#C02080"
              variant="line"
              valueFormat="percent1"
              metricName={metricLabelFull[primaryMetric]}
              valueAxisLabel={metricLabelFull[primaryMetric]}
            />
          ) : (
            <BarChartBase
              data={weeklyData}
              color={primaryMetric === "shares" ? "#E0A010" : primaryMetric === "interactions" ? "#C02080" : "#304090"}
              metricName={metricLabelFull[primaryMetric]}
              valueAxisLabel={metricLabelFull[primaryMetric]}
            />
          )}
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
    return `${MONTHS[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}`;
  }
  return `${MONTHS[mon.getMonth()]} ${mon.getDate()}–${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
}

import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import { filterPosts, dailyReach, reach, bdt } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
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

  // Small-multiples: four synchronized weekly series — reach, volume, shares,
  // engagement rate — laid out as a 2×2 grid of mini cards. Purpose is
  // at-a-glance pattern matching: a user should be able to tell within two
  // seconds whether the week's reach dip coincided with a volume drop (cadence
  // problem) or held steady (content problem). Each mini chart uses the same
  // x-axis (week) so patterns line up vertically across the grid.
  const weekKeys = Array.from(
    new Set([
      ...Object.keys(byDay).map((d) => {
        const dd = new Date(d);
        return `${dd.getFullYear()}-W${String(getWeek(dd)).padStart(2, "0")}`;
      }),
      ...Object.keys(weekBuckets),
      ...Object.keys(weekShares),
    ])
  ).sort();
  const weeklyVolume: Record<string, number> = {};
  const weeklyReach: Record<string, number> = {};
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const weekKey = `${d.getFullYear()}-W${String(getWeek(d)).padStart(2, "0")}`;
    weeklyVolume[weekKey] = (weeklyVolume[weekKey] || 0) + 1;
    weeklyReach[weekKey] = (weeklyReach[weekKey] || 0) + reach(p);
  }
  const multiples = weekKeys.map((wk) => ({
    week: wk.slice(5), // "W14" etc
    reach: weeklyReach[wk] || 0,
    volume: weeklyVolume[wk] || 0,
    shares: weekShares[wk] || 0,
    er: weekBuckets[wk]?.reach ? ((weekBuckets[wk].eng / weekBuckets[wk].reach) * 100) : 0,
  }));

  return (
    <div>
      <PageHeader title="Trends" subtitle="Time-based patterns across the period" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />

      {/* Small multiples — four weekly series stacked on the same x-axis so
          the eye can match shapes across metrics. Sparkline height is 40px
          so the whole strip stays under 200px and doesn't steal focus from
          the full-size charts below. */}
      {multiples.length >= 2 && (
        <Card className="!p-5 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Weekly at-a-glance</h3>
              <p className="text-xs text-slate-500 mt-0.5">Four series across the same weeks — read vertically for correlated dips/spikes</p>
            </div>
            <div className="text-[11px] text-slate-500">{multiples.length} week{multiples.length === 1 ? "" : "s"}</div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "reach", label: "Reach", color: "#4f46e5", fmt: (v: number) => v.toLocaleString() },
              { key: "volume", label: "Posts", color: "#06b6d4", fmt: (v: number) => v.toString() },
              { key: "shares", label: "Shares", color: "#f59e0b", fmt: (v: number) => v.toLocaleString() },
              { key: "er", label: "Eng. rate", color: "#ec4899", fmt: (v: number) => v.toFixed(2) + "%" },
            ].map((m) => {
              const vals = multiples.map((w) => w[m.key as keyof typeof w] as number);
              const max = Math.max(...vals, 0.0001);
              const last = vals[vals.length - 1] || 0;
              const prev = vals.length > 1 ? vals[vals.length - 2] : 0;
              const delta = prev > 0 ? ((last - prev) / prev) * 100 : 0;
              // Build a simple SVG polyline sparkline. Width-normalized so
              // all four grid cells render the same horizontal span
              // regardless of how many weeks are in range.
              const W = 160;
              const H = 40;
              const step = vals.length > 1 ? W / (vals.length - 1) : 0;
              const pts = vals
                .map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`)
                .join(" ");
              return (
                <div key={m.key}>
                  <div className="flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</div>
                    <div
                      className={`text-[11px] font-semibold tabular-nums ${
                        delta > 0 ? "text-brand-green" : delta < 0 ? "text-brand-red" : "text-slate-500"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{m.fmt(last)}</div>
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 mt-1" preserveAspectRatio="none" aria-hidden="true">
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={m.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Daily Posting Volume"
          kind="observed"
          subtitle="Posts published per day"
          definition="Count of posts published on each calendar day (BDT). Gaps mean no posts were published that day."
          caption="Number of posts published each day in the selected period."
        >
          <BarChartBase data={volumeData} color="#06b6d4" metricName="Posts" valueAxisLabel="Posts published" categoryAxisLabel="Date (MM-DD)" />
        </ChartCard>
        <ChartCard
          title="Daily Reach"
          kind="observed"
          subtitle="Unique reach per day"
          definition="Sum of post-level unique reach for posts published that day. Not lifetime page reach — reach attributed to posts. Spikes typically mean a single post went viral."
          caption="Daily unique reach — spikes often indicate viral or boosted content."
        >
          <TrendChart data={reachData} color="#10b981" variant="area" metricName="Reach" valueAxisLabel="Unique reach" />
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
            color="#ec4899"
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
          <BarChartBase data={sharesData} color="#f59e0b" metricName="Shares" valueAxisLabel="Shares" />
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

import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import { filterPosts, computeKpis, dailyReach, dailyMetricTrend, groupStats, groupStatValue, groupStatCompositeScore, wowDelta } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import MultiLineTrendChart, { type MultiSeries } from "@/components/MultiLineTrendChart";
import Donut from "@/components/Donut";
import BarChartBase from "@/components/BarChart";
import { canonicalColor } from "@/lib/colors";
import MetricSelector, { parseMetricParam, parseWeightsParam } from "@/components/MetricSelector";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  // Sprint P7 Phase 3: page-level multi-metric ranking. Default ["reach"]
  // preserves the legacy "Reach Trend" + reach-ranked Content Pillars
  // behavior. Multi-select activates composite (percentile-rank avg)
  // ranking on the pillars chart; the trend chart shows the FIRST
  // active metric (multi-line trend chart is a v3.5 follow-up).
  const activeMetrics = parseMetricParam(searchParams.metric);
  const activeWeights = parseWeightsParam(searchParams.weights, activeMetrics.length);
  const primaryMetric = activeMetrics[0];
  const isComposite = activeMetrics.length > 1;
  const metricLabel: Record<typeof primaryMetric, string> = {
    reach: "Reach",
    interactions: "Interactions",
    engagement: "Engagement Rate",
    shares: "Shares",
  };

  const [posts, daily, runStatus] = await Promise.all([
    getPosts(),
    getDailyMetrics(),
    getRunStatus(),
  ]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });
  const kpis = computeKpis(inRange);

  // Previous period of same length for WoW-style delta
  const rangeDays = Math.max(1, Math.floor((range.end.getTime() - range.start.getTime()) / 86_400_000));
  const prevEnd = new Date(range.start);
  const prevStart = new Date(prevEnd.getTime() - rangeDays * 86_400_000);
  const prevRange = filterPosts(posts, { start: prevStart, end: prevEnd });
  const prevKpis = computeKpis(prevRange);

  const reachDelta = wowDelta(kpis.total_reach, prevKpis.total_reach).pct;
  const engDelta = wowDelta(kpis.avg_engagement_rate, prevKpis.avg_engagement_rate).pct;
  const postsDelta = wowDelta(kpis.posts, prevKpis.posts).pct;

  // Followers from daily metrics (filtered to range)
  const dailyInRange = daily.filter((d) => {
    if (!d.date) return false;
    const t = new Date(d.date);
    return t >= range.start && t <= range.end;
  });
  const netFollowers = dailyInRange.reduce((s, d) => s + ((d.new_follows || 0) - (d.unfollows || 0)), 0);
  const currentFollowers = dailyInRange.length ? dailyInRange[dailyInRange.length - 1].followers_total : (daily.length ? daily[daily.length - 1].followers_total : 0);

  // Sprint P7 Phase 3: trend chart re-keys to active primary metric.
  // dailyMetricTrend handles sum-vs-mean semantics per metric (reach
  // sums daily; engagement averages daily).
  // v3.5 (2026-04-29): when 2+ metrics active, build per-series data
  // for the multi-line normalized trend chart (each series % of its
  // own peak so unit-mismatched metrics share one y-axis).
  const trend = dailyMetricTrend(inRange, primaryMetric).map((d) => ({
    date: d.date.slice(5),
    value: d.value,
  }));
  const METRIC_COLORS: Record<typeof primaryMetric, string> = {
    reach: "#304090",        // shikho-indigo-600
    interactions: "#C02080", // shikho-magenta-500
    engagement: "#1A8E78",   // brand green
    shares: "#E0A010",       // shikho-sunrise-500
  };
  const compositeTrendSeries: MultiSeries[] = isComposite
    ? activeMetrics.map((m) => ({
        name: metricLabel[m],
        color: METRIC_COLORS[m],
        data: dailyMetricTrend(inRange, m).map((d) => ({
          date: d.date.slice(5),
          value: d.value,
        })),
        formatter: (v: number) =>
          m === "engagement" ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString(),
      }))
    : [];

  // Sprint P6: dropped the Virality / North-Star / Cadence strip and the
  // AI cost banner. Virality + north-star were second-order signals that
  // nobody opened Overview to read; cadence-gap was informational but
  // never drove a decision. AI cost belongs on an internal ops dashboard,
  // not the KPI overview. Helpers (virality, northStarScore, cadenceGaps,
  // reach) still live in lib/aggregate for other surfaces.

  // Format distribution
  const formatStats = groupStats(inRange, "format");
  const formatDist = formatStats.map((s) => ({ label: s.key || "Unknown", value: s.count }));

  // Content pillars — Sprint P7 Phase 3: rank by active metric.
  // Single-metric: direct value sort. Multi-metric: composite percentile
  // average. The bar VALUE shown is the metric's raw total (or composite
  // rank 0..100 for multi-select so the bar still has a tangible scale).
  const pillarStatsAll = groupStats(inRange, "content_pillar");
  const pillarStatsRanked = isComposite
    ? [...pillarStatsAll].sort(
        (a, b) =>
          groupStatCompositeScore(b, activeMetrics, pillarStatsAll, activeWeights) -
          groupStatCompositeScore(a, activeMetrics, pillarStatsAll, activeWeights),
      )
    : [...pillarStatsAll].sort(
        (a, b) => groupStatValue(b, primaryMetric) - groupStatValue(a, primaryMetric),
      );
  const pillarStats = pillarStatsRanked.slice(0, 10);
  const pillarData = pillarStats.map((s) => ({
    label: s.key || "Unknown",
    value: isComposite
      ? Math.round(groupStatCompositeScore(s, activeMetrics, pillarStatsAll, activeWeights) * 100)
      : groupStatValue(s, primaryMetric),
    color: canonicalColor("pillar", s.key),
  }));

  // Biggest movers — pillar-level deltas vs the previous equal-length
  // period. The old "Engagement Mix" donut (reactions vs comments vs shares)
  // was aesthetically pleasing but non-actionable: the mix rarely shifts
  // meaningfully and doesn't inform a decision about what to post next.
  // Movers answer the question someone actually opens Overview for: "what
  // changed this period, and is it good or bad?" Top 3 risers + top 3
  // fallers, ranked by absolute % delta.
  //
  // Sprint P7 QA pass (2026-04-28): movers re-key to active primary
  // metric. With composite (2+ active) we still use primary-metric
  // delta — composite-of-deltas is awkward to define and less
  // actionable. Filter floor adapts per metric so we don't compare
  // engagement-rate jumps in absolute terms (a 0.5%→2% engagement
  // swing IS the story, not noise).
  const prevPillarStats = groupStats(prevRange, "content_pillar");
  const prevPillarMap = new Map(prevPillarStats.map((s) => [s.key, s]));
  type Mover = { key: string; current: number; previous: number; pct: number };
  // Floor = "ignore tiny-base pillars" — scaled per metric so engagement
  // rate uses a percentage threshold instead of a raw 5000 floor.
  const moverFloor: Record<typeof primaryMetric, number> = {
    reach: 5000,
    interactions: 50,
    engagement: 0.5, // 0.5% engagement rate floor
    shares: 5,
  };
  const floor = moverFloor[primaryMetric];
  const moverRaw: Mover[] = groupStats(inRange, "content_pillar")
    .map((s) => {
      const prevStat = prevPillarMap.get(s.key);
      const cur = groupStatValue(s, primaryMetric);
      const prev = prevStat ? groupStatValue(prevStat, primaryMetric) : 0;
      return {
        key: s.key || "Unknown",
        current: cur,
        previous: prev,
        pct: wowDelta(cur, prev).pct,
      };
    })
    .filter((m) => (m.previous >= floor || m.current >= floor));
  const risers = [...moverRaw].sort((a, b) => b.pct - a.pct).filter((m) => m.pct > 0).slice(0, 3);
  const fallers = [...moverRaw].sort((a, b) => a.pct - b.pct).filter((m) => m.pct < 0).slice(0, 3);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Key performance at a glance" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />

      {/* Sprint P7 Phase 3: page-level metric selector. Affects the
          Reach/Interactions/etc Trend chart + the Content Pillars
          ranking. Format Distribution intentionally NOT affected
          (its semantic — "what's the post mix" — doesn't change
          based on which metric you rank by). */}
      <MetricSelector
        basePath="/"
        active={activeMetrics}
        weights={activeWeights}
        preserve={searchParams}
      />

      {/* KPIs — canonical template caps at 5 cards (Batch 3d, #19). Dropped
          "Interactions" because Engagement Rate is the same signal normalized
          — raw count encourages the wrong read (a reach-up/rate-down period
          shows as interactions-up, which is misleading). ER % is the post-
          quality metric a planner actually targets. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Posts" value={kpis.posts} delta={postsDelta} sublabel="vs prev" />
        <KpiCard label="Total Reach" value={kpis.total_reach} delta={reachDelta} sublabel="vs prev" />
        <KpiCard label="Engagement Rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} delta={engDelta} sublabel="vs prev · reach-weighted" />
        <KpiCard label="Avg Reach/Post" value={kpis.avg_reach_per_post} />
        <KpiCard label="Followers" value={currentFollowers} sublabel={`${netFollowers >= 0 ? "+" : ""}${netFollowers.toLocaleString()} in range`} />
      </div>

      {/* Primary chart: trend re-keys to active primary metric.
          v3.5 (2026-04-29): when 2+ metrics active, swap to the
          MultiLineTrendChart that plots each series normalized to %
          of its own peak — solves the unit-mismatch problem (reach
          10000s, ER 0.X%, shares 10s) without jamming multiple
          y-axes onto one chart. Single-metric path unchanged. */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title={
            isComposite
              ? `Composite Trend (${activeMetrics.length} metrics, normalized)`
              : `${metricLabel[primaryMetric]} Trend`
          }
          kind="observed"
          subtitle={
            isComposite
              ? "Each line normalized to % of its own peak — shapes are comparable, raw values shown in tooltip"
              : primaryMetric === "engagement"
                ? "Daily mean engagement rate"
                : primaryMetric === "reach"
                  ? "Daily unique reach"
                  : `Daily total ${primaryMetric}`
          }
          definition={
            isComposite
              ? "Multi-series trend with per-series % of peak normalization. A line at 100% means that day was that metric's peak in the period; 50% means half the peak. Hover any point to see the raw value in original units."
              : primaryMetric === "engagement"
                ? "Mean post-level engagement rate per day. Engagement rate = interactions ÷ reach × 100. Days with no posts emit 0."
                : "Sum of the active metric for posts published that day. Attributed to post-publish date in BDT."
          }
          caption={
            isComposite
              ? "Shapes diverge → metrics are telling different stories that period (worth investigating). Shapes track → metrics correlate (one signal can stand in for the other)."
              : `Daily ${metricLabel[primaryMetric].toLowerCase()} for posts in the selected period.`
          }
        >
          {isComposite ? (
            <MultiLineTrendChart series={compositeTrendSeries} />
          ) : (
            <TrendChart
              data={trend}
              color="#304090"
              metricName={metricLabel[primaryMetric]}
              valueAxisLabel={metricLabel[primaryMetric]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Format Distribution"
          kind="ai"
          subtitle="Post count by format"
          definition="Count of posts by format (Reel / Photo / Carousel / Video). Format is pulled from the post's media type, cross-verified with the weekly classifier."
          caption="Share of total posts by format. Heavy tilt toward one format may indicate under-diversification."
        >
          <Donut data={formatDist} metricName="Posts" />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Content Pillars"
          kind="ai"
          subtitle={
            isComposite
              ? `Composite rank by ${activeMetrics.length} metrics`
              : `${primaryMetric === "engagement" ? "Avg" : "Total"} ${metricLabel[primaryMetric].toLowerCase()} by content pillar`
          }
          definition={
            isComposite
              ? "Composite rank: each metric percentile-normalized within the pillar set, then averaged with equal weight. Bars show the composite score 0–100 (higher = better)."
              : `${primaryMetric === "engagement" ? "Mean" : "Sum"} of ${metricLabel[primaryMetric].toLowerCase()} for all posts in each pillar. Pillars are assigned by the weekly classifier.`
          }
          sampleSize={`top ${pillarData.length} of ${pillarStatsAll.length}`}
          caption={
            isComposite
              ? "Pillars ranked by their average percentile across the selected metrics. A pillar that's strong on every metric ranks above one that's only top on a single dimension."
              : `Which pillars drive the most ${metricLabel[primaryMetric].toLowerCase()} in this period. Percentage is share of total across the pillars displayed.`
          }
        >
          <BarChartBase
            data={pillarData}
            horizontal
            height={Math.max(200, pillarData.length * 32)}
            metricName={isComposite ? "Composite" : metricLabel[primaryMetric]}
            valueAxisLabel={isComposite ? "Composite score" : metricLabel[primaryMetric]}
            showPercent={!isComposite}
          />
        </ChartCard>

        <ChartCard
          title="Biggest Movers"
          kind="derived"
          subtitle={`Pillar ${metricLabel[primaryMetric].toLowerCase()} vs previous period`}
          definition={`For each content pillar: ${primaryMetric === "engagement" ? "mean engagement rate" : `total ${metricLabel[primaryMetric].toLowerCase()}`} this period vs the same number of days immediately preceding it. Tiny-base pillars are excluded so small pillars with noisy % deltas don't drown out real shifts. Ranked by absolute % change.`}
          sampleSize={`top ${risers.length + fallers.length} of ${moverRaw.length} pillars`}
          caption="Which pillars gained ground this period, which lost it. Lean into the risers, diagnose the fallers before next week's plan."
        >
          {risers.length + fallers.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-500">
              Not enough pillars clear the {floor.toLocaleString()}{primaryMetric === "engagement" ? "%" : ""}-{metricLabel[primaryMetric].toLowerCase()} threshold in either period to rank movers. Widen the date range.
            </div>
          ) : (
            <div className="space-y-4">
              {risers.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-green mb-2">Risers</div>
                  <ul className="space-y-2">
                    {risers.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-semibold truncate"
                            style={{ color: canonicalColor("pillar", m.key) }}
                          >
                            {m.key}
                          </div>
                          <div className="text-[11px] text-ink-500 tabular-nums">
                            {primaryMetric === "engagement"
                              ? `${m.current.toFixed(2)}% (was ${m.previous.toFixed(2)}%)`
                              : `${Math.round(m.current).toLocaleString()} ${metricLabel[primaryMetric].toLowerCase()} (was ${Math.round(m.previous).toLocaleString()})`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-brand-green tabular-nums shrink-0">
                          {m.pct > 0 ? "+" : ""}{m.pct.toFixed(1)}%
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {fallers.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-red mb-2">Fallers</div>
                  <ul className="space-y-2">
                    {fallers.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-semibold truncate"
                            style={{ color: canonicalColor("pillar", m.key) }}
                          >
                            {m.key}
                          </div>
                          <div className="text-[11px] text-ink-500 tabular-nums">
                            {primaryMetric === "engagement"
                              ? `${m.current.toFixed(2)}% (was ${m.previous.toFixed(2)}%)`
                              : `${Math.round(m.current).toLocaleString()} ${metricLabel[primaryMetric].toLowerCase()} (was ${Math.round(m.previous).toLocaleString()})`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-brand-red tabular-nums shrink-0">
                          {m.pct.toFixed(1)}%
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

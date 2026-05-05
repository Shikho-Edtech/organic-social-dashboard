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
import RecommendedThisPeriod, { type BestStat, type BestSlot } from "@/components/RecommendedThisPeriod";
import { isLowConfidence } from "@/lib/aggregate";
import { minPostsForRange } from "@/lib/stats";
import { rangeDays as computeRangeDays } from "@/lib/daterange";

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
  // Sprint P7 v4.7 (2026-04-30, P1.1): AVG REACH/POST was the only KPI
  // missing a delta — it's mathematically derivable from Total Reach
  // and Posts but the user had no reason to do that math themselves.
  // Now matches the other "flow" KPIs.
  const avgReachPerPostDelta = wowDelta(kpis.avg_reach_per_post, prevKpis.avg_reach_per_post).pct;

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
        // Sprint P7 v4.4: serializable kind (was a function — crashed on
        // server→client prop boundary in Next.js 14).
        formatKind: m === "engagement" ? "percent" : "number",
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

  // Sprint P7 v4 (2026-04-29): per-cell composite breakdown for the
  // BarChartBase tooltip. For each pillar in composite mode, compute
  // the per-metric percentile rank within the pillar population +
  // the active weight share. Caches sorted lookups once per metric.
  const pillarCompositeBreakdown: Record<string, Array<{
    name: string; percentile: number; weight: number; raw?: string;
  }>> = {};
  if (isComposite) {
    // Per-metric sorted population for percentile lookup.
    const sortedByMetric: Record<string, number[]> = {};
    for (const m of activeMetrics) {
      sortedByMetric[m] = pillarStatsAll
        .map((p) => groupStatValue(p, m))
        .sort((a, b) => a - b);
    }
    // Sum-normalize weights (matches compositeScore math).
    const rawWeights = activeWeights && activeWeights.length === activeMetrics.length
      ? activeWeights
      : activeMetrics.map(() => 1);
    const totalW = rawWeights.reduce((s, x) => s + Math.max(0, x), 0) || 1;
    const normalized = rawWeights.map((w) => (Math.max(0, w) / totalW) * 100);
    // Per-pillar breakdown.
    for (const s of pillarStatsAll) {
      const label = s.key || "Unknown";
      pillarCompositeBreakdown[label] = activeMetrics.map((m, i) => {
        const value = groupStatValue(s, m);
        const sorted = sortedByMetric[m];
        // Percentile rank = fraction strictly less than value.
        let lo = 0, hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid] < value) lo = mid + 1; else hi = mid;
        }
        const percentile = sorted.length > 0 ? (lo / sorted.length) * 100 : 0;
        return {
          name: metricLabel[m],
          percentile,
          weight: normalized[i],
          raw: m === "engagement" ? `${value.toFixed(2)}%` : Math.round(value).toLocaleString(),
        };
      });
    }
  }

  // R4 (2026-05-02): consolidated "Recommended this period" — merges the
  // playbook bests (Engagement-page logic) into one Overview card.
  //
  // R4 hotfix (2026-05-02 live check): live check found Overview's
  // recommendations disagreed with Engagement's because Overview wasn't
  // applying the same `inRangeConfident` + MIN_N gate Engagement uses.
  // Tiny-sample buckets (e.g. Celebration on 4 posts) were winning over
  // statistically reliable buckets (Announcement on 80 posts). Now
  // mirrored: drop low-confidence classifications, gate at MIN_N posts,
  // exclude None/Unknown labels — exactly what Engagement does.
  const inRangeConfidentOverview = inRange.filter((p) => !isLowConfidence(p));
  const REC_MIN_N = minPostsForRange(computeRangeDays(range));
  const filterRec = <T extends { key: string; count: number }>(rows: T[], excludeNone = true): T[] =>
    rows.filter(
      (s) =>
        s.count >= REC_MIN_N &&
        s.key &&
        (!excludeNone ||
          (s.key.toLowerCase() !== "none" && s.key.toLowerCase() !== "unknown")),
    );
  const hookStatsOverview = filterRec(groupStats(inRangeConfidentOverview, "hook_type"));
  const spotlightStatsOverview = filterRec(groupStats(inRangeConfidentOverview, "spotlight_type"));
  const toneStatsOverview = filterRec(groupStats(inRangeConfidentOverview, "caption_tone"));
  // Format isn't classifier-derived — keep using inRange (matches Engagement).
  const formatStatsForRec = formatStats.filter((s) => s.count >= REC_MIN_N && s.key);
  // Pillars: use confidence-filtered set (matches Engagement's pillarStats).
  const pillarStatsForRec = filterRec(groupStats(inRangeConfidentOverview, "content_pillar"), false);
  const rankByER = <T extends { avg_engagement_rate: number }>(rows: T[]): T | undefined => {
    if (!rows.length) return undefined;
    return [...rows].sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)[0];
  };
  const toBestStat = (
    row: { key: string; avg_engagement_rate: number; count: number } | undefined,
  ): BestStat | undefined =>
    row ? { key: row.key, rate: row.avg_engagement_rate, count: row.count } : undefined;
  const bestFormatRec = toBestStat(rankByER(formatStatsForRec));
  const bestPillarRec = toBestStat(rankByER(pillarStatsForRec));
  const bestHookRec = toBestStat(rankByER(hookStatsOverview));
  const bestSpotlightRec = toBestStat(rankByER(spotlightStatsOverview));
  const bestToneRec = toBestStat(rankByER(toneStatsOverview));

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
  // Sprint P7 v4.18 (W7, 2026-05-02): biggest movers respects the active
  // ranking metrics. Single-metric mode unchanged. Composite mode computes
  // the percentile-rank composite score for each pillar in the current and
  // prior period (each evaluated against ITS OWN period's pillar
  // distribution so percentiles are honest), then takes WoW delta of the
  // 0-100 scores.
  //
  // Hotfix (2026-05-02 user feedback): composite scores are 0-100, but the
  // pre-fix floor averaged the per-metric raw-value floors → ~1264. That's
  // unreachable for any 0-100 score, so every pillar got filtered out and
  // the panel rendered "TOP 0 OF 0 PILLARS · Not enough pillars clear the
  // composite-score floor." Fix: composite mode uses a 0-100-space floor
  // (5 = "above the 5th percentile in either period"), single-metric mode
  // keeps its raw-value floor.
  const floor = isComposite ? 5 : moverFloor[primaryMetric];
  const currStatsAll = groupStats(inRange, "content_pillar");
  const moverRaw: Mover[] = currStatsAll
    .map((s) => {
      const prevStat = prevPillarMap.get(s.key);
      const cur = isComposite
        ? Math.round(groupStatCompositeScore(s, activeMetrics, currStatsAll, activeWeights) * 100)
        : groupStatValue(s, primaryMetric);
      const prev = isComposite
        ? prevStat
          ? Math.round(groupStatCompositeScore(prevStat, activeMetrics, prevPillarStats, activeWeights) * 100)
          : 0
        : prevStat
          ? groupStatValue(prevStat, primaryMetric)
          : 0;
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
      <PageHeader title="Overview" subtitle="Key performance at a glance" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} compact />

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
        <KpiCard
          label="Engagement Rate"
          value={kpis.avg_engagement_rate.toFixed(2) + "%"}
          delta={engDelta}
          sublabel="vs prev · reach-weighted"
          labelTooltip="Reach-weighted: (Σ reactions + comments + shares across all posts) ÷ (Σ unique reach across all posts) × 100. Different from a naive per-post-rate average — a few high-reach posts dominate the signal, which matches what you actually want for top-of-funnel measurement. Consistent across Overview/Engagement/Trends/Timing."
        />
        <KpiCard label="Avg Reach/Post" value={kpis.avg_reach_per_post} delta={avgReachPerPostDelta} sublabel="vs prev" />
        {/* Sprint P7 v4.7 (2026-04-30, P1.1): Followers card is a stock
            (snapshot count), not a flow. The other 4 cards are flows.
            "in range" sublabel + no delta-pill (we use a net-add string
            instead) is intentional, but the visual treatment was
            identical — adding the small `(stock)` tag clarifies. */}
        <KpiCard
          label="Followers"
          value={currentFollowers}
          // 2026-05-05: net follower change is a COUNT not a %, but it
          // should still color green/red like the other 4 KPI cards.
          // Pass `delta` for the sign-based color and `deltaLabel` to
          // override the default "+X.X%" formatting with the count.
          delta={netFollowers}
          deltaLabel={`${netFollowers >= 0 ? "+" : ""}${netFollowers.toLocaleString()} net`}
          sublabel="in range · stock"
        />
      </div>

      {/* R4 (2026-05-02): Recommended this period — synthesised playbook.
          Merges what was previously 4-card grid on Engagement + posting-
          window hero on Timing into one Overview card. Each card uses
          its dimension's canonical color so the eye lands on the
          recommendation type first, then the value. Cross-links push
          operators to Engagement / Timing detail when they want depth. */}
      <RecommendedThisPeriod
        bestFormat={bestFormatRec}
        bestPillar={bestPillarRec}
        bestHook={bestHookRec}
        bestSpotlight={bestSpotlightRec}
        bestTone={bestToneRec}
        colorFor={(axis, key) => canonicalColor(axis, key)}
      />

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
          title={
            isComposite
              ? `Content Pillars · Composite of ${activeMetrics.map((m) => metricLabel[m]).join(", ")}`
              : "Content Pillars"
          }
          kind="ai"
          subtitle={
            isComposite
              ? `Ranked by composite of ${activeMetrics.length} metrics: ${activeMetrics.map((m) => metricLabel[m].toLowerCase()).join(" · ")}`
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
            // Single-metric mode shows each pillar's % share of total
            // (e.g. "Live Class: 40%"). Composite mode shows the raw 0-100
            // score at the bar end (e.g. "Live Class: 65") so the operator
            // can read the value without hovering — fix per page-by-page
            // review 2026-05-05.
            showPercent={!isComposite}
            showValueLabel={isComposite}
            compositeBreakdown={isComposite ? pillarCompositeBreakdown : undefined}
          />
        </ChartCard>

        <ChartCard
          title={
            isComposite
              ? `Biggest Movers · Composite of ${activeMetrics.map((m) => metricLabel[m]).join(", ")}`
              : "Biggest Movers"
          }
          kind="derived"
          subtitle={
            isComposite
              ? `Pillar composite score vs previous period (across ${activeMetrics.map((m) => metricLabel[m].toLowerCase()).join(" / ")})`
              : `Pillar ${metricLabel[primaryMetric].toLowerCase()} vs previous period`
          }
          definition={
            isComposite
              ? `For each content pillar: composite percentile-rank score (averaged across ${activeMetrics.length} metrics — ${activeMetrics.map((m) => metricLabel[m].toLowerCase()).join(", ")}) this period vs the same number of days immediately preceding it. Each period's percentiles are computed within ITS OWN pillar distribution so the rank is honest. Ranked by absolute % change.`
              : `For each content pillar: ${primaryMetric === "engagement" ? "mean engagement rate" : `total ${metricLabel[primaryMetric].toLowerCase()}`} this period vs the same number of days immediately preceding it. Tiny-base pillars are excluded so small pillars with noisy % deltas don't drown out real shifts. Ranked by absolute % change.`
          }
          sampleSize={`top ${risers.length + fallers.length} of ${moverRaw.length} pillars`}
          caption={
            isComposite
              ? "Which pillars climbed or fell most across all selected metrics combined. Lean into the risers, diagnose the fallers before next week's plan."
              : "Which pillars gained ground this period, which lost it. Lean into the risers, diagnose the fallers before next week's plan."
          }
        >
          {risers.length + fallers.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-500">
              {isComposite
                ? `Not enough pillars clear the composite-score floor in either period to rank movers. Widen the date range or reduce metric count.`
                : `Not enough pillars clear the ${floor.toLocaleString()}${primaryMetric === "engagement" ? "%" : ""}-${metricLabel[primaryMetric].toLowerCase()} threshold in either period to rank movers. Widen the date range.`}
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
                            {/* 2026-05-05 fix: in composite mode the value is a
                                 0-100 percentile-rank score, NOT a raw metric
                                 value. Labelling it "X reach" or "X interactions"
                                 produced implausible reads like "38 reach, was 5"
                                 for a 30-day window. Render as "score" so the
                                 number's scale matches the user's expectation. */}
                            {isComposite
                              ? `score ${Math.round(m.current)} (was ${Math.round(m.previous)})`
                              : primaryMetric === "engagement"
                              ? `${m.current.toFixed(2)}% (was ${m.previous.toFixed(2)}%)`
                              : `${Math.round(m.current).toLocaleString()} ${metricLabel[primaryMetric].toLowerCase()} (was ${Math.round(m.previous).toLocaleString()})`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-brand-green tabular-nums shrink-0">
                          {/* Sprint P7 v4.7 (2026-04-30, P2.22): when
                              percent change is >= +300%, switch to a
                              multiplier format ("12.7×") which reads
                              cleaner than "+1169.7%". Fallers stay as
                              percentages because negative multipliers
                              don't read intuitively. */}
                          {m.pct >= 300
                            ? `${(1 + m.pct / 100).toFixed(1)}×`
                            : `${m.pct > 0 ? "+" : ""}${m.pct.toFixed(1)}%`}
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
                            {isComposite
                              ? `score ${Math.round(m.current)} (was ${Math.round(m.previous)})`
                              : primaryMetric === "engagement"
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

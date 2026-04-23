import { getPosts, getDailyMetrics, getRunStatus } from "@/lib/sheets";
import { filterPosts, computeKpis, dailyReach, groupStats, wowDelta } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import Donut from "@/components/Donut";
import BarChartBase from "@/components/BarChart";
import { canonicalColor } from "@/lib/colors";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

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

  // Weekly reach trend
  const trend = dailyReach(inRange).map((d) => ({ date: d.date.slice(5), value: d.reach }));

  // Sprint P6: dropped the Virality / North-Star / Cadence strip and the
  // AI cost banner. Virality + north-star were second-order signals that
  // nobody opened Overview to read; cadence-gap was informational but
  // never drove a decision. AI cost belongs on an internal ops dashboard,
  // not the KPI overview. Helpers (virality, northStarScore, cadenceGaps,
  // reach) still live in lib/aggregate for other surfaces.

  // Format distribution
  const formatStats = groupStats(inRange, "format");
  const formatDist = formatStats.map((s) => ({ label: s.key || "Unknown", value: s.count }));

  // Content pillars
  const pillarStats = groupStats(inRange, "content_pillar").slice(0, 10);
  const pillarData = pillarStats.map((s) => ({
    label: s.key || "Unknown",
    value: s.total_reach,
    color: canonicalColor("pillar", s.key),
  }));

  // Biggest movers — pillar-level reach deltas vs the previous equal-length
  // period. The old "Engagement Mix" donut (reactions vs comments vs shares)
  // was aesthetically pleasing but non-actionable: the mix rarely shifts
  // meaningfully and doesn't inform a decision about what to post next.
  // Movers answer the question someone actually opens Overview for: "what
  // changed this period, and is it good or bad?" Top 3 risers + top 3
  // fallers, ranked by absolute % delta (so a -40% -> +10% swing reads
  // correctly even if the absolute reach number is small).
  const prevPillarStats = groupStats(prevRange, "content_pillar");
  const prevPillarMap = new Map(prevPillarStats.map((s) => [s.key, s]));
  type Mover = { key: string; current: number; previous: number; pct: number };
  const moverRaw: Mover[] = groupStats(inRange, "content_pillar")
    .map((s) => {
      const prev = prevPillarMap.get(s.key)?.total_reach ?? 0;
      return {
        key: s.key || "Unknown",
        current: s.total_reach,
        previous: prev,
        pct: wowDelta(s.total_reach, prev).pct,
      };
    })
    // Ignore tiny-base pillars; a jump from 50 → 200 reach is a 300% rise
    // that would dominate the list and obscure the pillars that matter.
    .filter((m) => (m.previous >= 5000 || m.current >= 5000));
  const risers = [...moverRaw].sort((a, b) => b.pct - a.pct).filter((m) => m.pct > 0).slice(0, 3);
  const fallers = [...moverRaw].sort((a, b) => a.pct - b.pct).filter((m) => m.pct < 0).slice(0, 3);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Key performance at a glance" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />

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

      {/* Primary chart: reach trend */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Reach Trend"
          kind="observed"
          subtitle="Daily unique reach"
          definition="Sum of post-level unique reach for posts published that day. Attributed to post-publish date, not page impression date."
          caption="Daily unique users reached by posts in the selected period."
        >
          <TrendChart data={trend} color="#304090" metricName="Reach" valueAxisLabel="Unique reach" />
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
          subtitle="Total reach by content pillar"
          definition="Sum of unique reach for all posts in each pillar. Pillars are assigned by the weekly classifier using the full pillar taxonomy."
          sampleSize={`top ${pillarData.length} of ${groupStats(inRange, "content_pillar").length}`}
          caption="Which pillars drive the most audience reach in this period. Percentage shown is share of total reach across the pillars displayed."
        >
          <BarChartBase
            data={pillarData}
            horizontal
            height={Math.max(200, pillarData.length * 32)}
            metricName="Reach"
            valueAxisLabel="Unique reach"
            showPercent
          />
        </ChartCard>

        <ChartCard
          title="Biggest Movers"
          kind="derived"
          subtitle="Pillar reach vs previous period"
          definition="For each content pillar: total unique reach this period vs the same number of days immediately preceding it. Tiny-base pillars (< 5k reach either side) are excluded so small pillars with noisy % deltas don't drown out real shifts. Ranked by absolute % change."
          sampleSize={`top ${risers.length + fallers.length} of ${moverRaw.length} pillars`}
          caption="Which pillars gained ground this period, which lost it. Lean into the risers, diagnose the fallers before next week's plan."
        >
          {risers.length + fallers.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-500">
              Not enough pillars clear the 5k-reach threshold in either period to rank movers. Widen the date range.
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
                            {m.current.toLocaleString()} reach (was {m.previous.toLocaleString()})
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
                            {m.current.toLocaleString()} reach (was {m.previous.toLocaleString()})
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

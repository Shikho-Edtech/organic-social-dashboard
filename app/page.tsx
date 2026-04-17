import { getPosts, getDailyMetrics } from "@/lib/sheets";
import { filterPosts, computeKpis, dailyReach, groupStats, wowDelta } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import { ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import Donut from "@/components/Donut";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

  const [posts, daily] = await Promise.all([getPosts(), getDailyMetrics()]);
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

  // Format distribution
  const formatStats = groupStats(inRange, "format");
  const formatDist = formatStats.map((s) => ({ label: s.key || "Unknown", value: s.count }));

  // Content pillars
  const pillarStats = groupStats(inRange, "content_pillar").slice(0, 10);
  const pillarData = pillarStats.map((s) => ({ label: s.key || "Unknown", value: s.total_reach }));

  // Engagement mix
  const totalReactions = inRange.reduce((s, p) => s + (p.reactions || 0), 0);
  const totalComments = inRange.reduce((s, p) => s + (p.comments || 0), 0);
  const totalShares = inRange.reduce((s, p) => s + (p.shares || 0), 0);
  const engagementMix = [
    { label: "Reactions", value: totalReactions },
    { label: "Comments", value: totalComments },
    { label: "Shares", value: totalShares },
  ];

  return (
    <div>
      <PageHeader title="Overview" subtitle="Key performance at a glance" dateLabel={range.label} />

      {/* KPIs — 6 cards in a row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Posts" value={kpis.posts} delta={postsDelta} sublabel="vs prev" />
        <KpiCard label="Total Reach" value={kpis.total_reach} delta={reachDelta} sublabel="vs prev" />
        <KpiCard label="Interactions" value={kpis.total_interactions} />
        <KpiCard label="Engagement Rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} delta={engDelta} sublabel="vs prev · reach-weighted" />
        <KpiCard label="Avg Reach/Post" value={kpis.avg_reach_per_post} />
        <KpiCard label="Followers" value={currentFollowers} sublabel={`${netFollowers >= 0 ? "+" : ""}${netFollowers.toLocaleString()} in range`} />
      </div>

      {/* Primary chart: reach trend */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Reach Trend"
          kind="observed"
          subtitle="Daily unique reach"
          definition="Sum of post-level unique reach for posts published that day. Attributed to post-publish date, not page impression date."
          caption="Daily unique users reached by posts in the selected period."
        >
          <TrendChart data={trend} color="#06b6d4" metricName="Reach" valueAxisLabel="Unique reach" />
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
            colorByIndex
            metricName="Reach"
            valueAxisLabel="Unique reach"
            showPercent
          />
        </ChartCard>

        <ChartCard
          title="Engagement Mix"
          kind="observed"
          subtitle="Reactions vs comments vs shares"
          definition="Total count of each interaction type across all posts in the period. Helps answer: is the audience passively reacting, actively discussing, or amplifying?"
          caption="How engagement is distributed across interaction types."
        >
          <Donut data={engagementMix} metricName="Interactions" />
        </ChartCard>
      </div>
    </div>
  );
}

import { getPosts } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { bestByLowerBound, reliabilityLabel } from "@/lib/stats";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";
import Donut from "@/components/Donut";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function EngagementPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  const posts = await getPosts();
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Format × engagement rate
  const formatStats = groupStats(inRange, "format").filter((s) => s.count >= 2);
  const formatER = formatStats.map((s) => ({ label: s.key, value: Number(s.avg_engagement_rate.toFixed(2)) }));
  const formatShares = formatStats.map((s) => ({
    label: s.key,
    value: Math.round(inRange.filter((p) => p.format === s.key).reduce((sum, p) => sum + (p.shares || 0), 0) / s.count),
  }));

  // Pillar × engagement rate (top 12 for readability)
  const pillarStats = groupStats(inRange, "content_pillar").filter((s) => s.count >= 2).slice(0, 12);
  const pillarER = pillarStats.map((s) => ({ label: s.key, value: Number(s.avg_engagement_rate.toFixed(2)) }));

  // Hook type effectiveness
  const hookStats = groupStats(inRange, "hook_type").filter((s) => s.count >= 2).slice(0, 10);
  const hookER = hookStats.map((s) => ({ label: s.key, value: Number(s.avg_engagement_rate.toFixed(2)) }));

  // Spotlight type effectiveness (v2 classifier)
  const spotlightStats = groupStats(inRange, "spotlight_type")
    .filter((s) => s.count >= 2 && s.key && s.key !== "None" && s.key !== "Unknown");
  const spotlightER = spotlightStats.map((s) => ({ label: s.key, value: Number(s.avg_engagement_rate.toFixed(2)) }));
  const spotlightReach = spotlightStats.map((s) => ({ label: s.key, value: s.avg_reach_per_post }));

  // Day 2O: CI-ranked "best X" callouts. Ranks by 95% CI lower bound of
  // engagement rate — single outliers in tiny buckets can't win.
  const bestFormat = bestByLowerBound(formatStats, (s) => s.er_summary);
  const bestPillar = bestByLowerBound(pillarStats, (s) => s.er_summary);
  const bestHook = bestByLowerBound(hookStats, (s) => s.er_summary);
  const bestSpotlight = bestByLowerBound(spotlightStats, (s) => s.er_summary);

  // Engagement breakdown (overall)
  const totals = inRange.reduce(
    (acc, p) => {
      acc.like += p.like || 0;
      acc.love += p.love || 0;
      acc.wow += p.wow || 0;
      acc.haha += p.haha || 0;
      acc.comments += p.comments || 0;
      acc.shares += p.shares || 0;
      return acc;
    },
    { like: 0, love: 0, wow: 0, haha: 0, comments: 0, shares: 0 }
  );
  const reactionDonut = [
    { label: "Like + Care", value: totals.like },
    { label: "Love", value: totals.love },
    { label: "Wow", value: totals.wow },
    { label: "Haha", value: totals.haha },
    { label: "Comments", value: totals.comments },
    { label: "Shares", value: totals.shares },
  ];

  return (
    <div>
      <PageHeader title="Engagement" subtitle="What drives interaction" dateLabel={range.label} />

      {/* CI-ranked "best X" strip — uses 95% CI lower bound so low-n buckets can't win */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best Format</div>
          <div className="text-2xl font-bold text-brand-cyan mt-2">{bestFormat?.key || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestFormat?.er_summary.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestFormat?.count || 0)}
            {bestFormat && isFinite(bestFormat.er_summary.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestFormat.er_summary.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best Pillar</div>
          <div className="text-2xl font-bold text-brand-pink mt-2">{bestPillar?.key || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestPillar?.er_summary.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestPillar?.count || 0)}
            {bestPillar && isFinite(bestPillar.er_summary.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestPillar.er_summary.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best Hook</div>
          <div className="text-2xl font-bold text-brand-green mt-2">{bestHook?.key || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestHook?.er_summary.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestHook?.count || 0)}
            {bestHook && isFinite(bestHook.er_summary.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestHook.er_summary.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best Spotlight Type</div>
          <div className="text-2xl font-bold text-brand-purple mt-2">{bestSpotlight?.key || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestSpotlight?.er_summary.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestSpotlight?.count || 0)}
            {bestSpotlight && isFinite(bestSpotlight.er_summary.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestSpotlight.er_summary.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Format Performance"
          kind="ai"
          subtitle="Avg engagement rate by format"
          definition="Engagement rate = (reactions + comments + shares) ÷ unique reach, averaged per post. Formats with fewer than 2 posts are hidden."
          sampleSize={`n = ${inRange.length} posts`}
          caption="Higher is better. A format that consistently beats the average is worth doubling down on."
        >
          <BarChartBase data={formatER} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Format" />
        </ChartCard>
        <ChartCard
          title="Shares per Post"
          kind="ai"
          subtitle="Avg shares by format"
          definition="Total shares in period ÷ number of posts in that format. Shares expand reach beyond the existing follower base — the strongest virality signal."
          caption="A format averaging high shares is pulling in new audience, not just engaging the existing one."
        >
          <BarChartBase data={formatShares} colorByIndex metricName="Avg shares" valueAxisLabel="Avg shares / post" categoryAxisLabel="Format" />
        </ChartCard>
      </div>

      <div className="mb-4">
        <ChartCard
          title="Pillar Performance"
          kind="ai"
          subtitle="Avg engagement rate by content pillar"
          definition="Average engagement rate per pillar. Only pillars with 2+ posts in the period are shown, to keep single outliers from misleading the ranking. Sorted by pillar name, not performance."
          sampleSize={`${pillarStats.length} pillars shown (2+ posts)`}
          caption="Identify which content themes resonate most with the audience. Use alongside the Strategy tab's top-performer list."
        >
          <BarChartBase data={pillarER} horizontal height={Math.max(240, pillarER.length * 32)} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" />
        </ChartCard>
      </div>

      {spotlightStats.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <ChartCard
            title="Spotlight Performance — Engagement"
            kind="ai"
            subtitle="Avg engagement rate by spotlight type"
            definition="Posts grouped by what they spotlight: Teacher, Product, Program, or Campaign. Only types with 2+ posts shown. Assigned by the v2.2 classifier."
            sampleSize={`${spotlightStats.length} spotlight types, n = ${spotlightStats.reduce((s, x) => s + x.count, 0)} posts`}
            caption="Which spotlight category the audience engages with most. If Teacher posts outperform Product posts, lean into the faculty."
          >
            <BarChartBase data={spotlightER} horizontal height={Math.max(180, spotlightER.length * 36)} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" />
          </ChartCard>
          <ChartCard
            title="Spotlight Performance — Reach"
            kind="ai"
            subtitle="Avg reach per post by spotlight type"
            definition="Average unique reach per post for each spotlight type. Pairs with the engagement-rate view to surface the full picture: a type can have high engagement on small reach, or vice versa."
            caption="High reach + high engagement means the spotlight type is working on both axes."
          >
            <BarChartBase data={spotlightReach} horizontal height={Math.max(180, spotlightReach.length * 36)} colorByIndex metricName="Avg reach" valueAxisLabel="Avg reach / post" />
          </ChartCard>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Hook Type Effectiveness"
          kind="ai"
          subtitle="Avg engagement rate by opening hook"
          definition="Posts grouped by classified hook type (Question, Stat, Celebration, etc.). Only hook types with 2+ posts are shown. Hook type is assigned by the weekly pipeline from the post's opening line."
          sampleSize={`${hookStats.length} hook types shown`}
          caption="If one hook dominates, try testing the same content with a different opening to see if it's the hook or the topic."
        >
          <BarChartBase data={hookER} horizontal height={Math.max(220, hookER.length * 32)} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" />
        </ChartCard>
        <ChartCard
          title="Engagement Breakdown"
          kind="observed"
          subtitle="Volume by interaction type"
          definition="Total count of each reaction / comment / share across all posts in the period. 'Like + Care' groups Facebook's Like and Care reactions together."
          caption="High comment share suggests active community dialogue; high share ratio suggests virality potential."
        >
          <Donut data={reactionDonut} metricName="Interactions" />
        </ChartCard>
      </div>
    </div>
  );
}

import { getPosts } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { ChartCard } from "@/components/Card";
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

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Format Performance" subtitle="Avg engagement rate by format" caption="Engagement rate = (reactions + comments + shares) ÷ unique reach. Higher is better.">
          <BarChartBase data={formatER} valueFormat="percent" colorByIndex />
        </ChartCard>
        <ChartCard title="Shares per Post" subtitle="Avg shares by format" caption="Shares amplify reach beyond your audience — the strongest virality signal.">
          <BarChartBase data={formatShares} colorByIndex />
        </ChartCard>
      </div>

      <div className="mb-4">
        <ChartCard title="Pillar Performance" subtitle="Avg engagement rate by content pillar" caption="Identify which content themes resonate most with the audience. Min 2 posts per pillar.">
          <BarChartBase data={pillarER} horizontal height={Math.max(240, pillarER.length * 32)} valueFormat="percent" colorByIndex />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Hook Type Effectiveness" subtitle="Avg engagement rate by opening hook" caption="Which opening patterns (Question, Stat, Celebration, etc.) engage best.">
          <BarChartBase data={hookER} horizontal height={Math.max(220, hookER.length * 32)} valueFormat="percent" colorByIndex />
        </ChartCard>
        <ChartCard title="Engagement Breakdown" subtitle="Volume by interaction type" caption="How engagement is distributed. High comment share suggests an active community dialogue.">
          <Donut data={reactionDonut} />
        </ChartCard>
      </div>
    </div>
  );
}

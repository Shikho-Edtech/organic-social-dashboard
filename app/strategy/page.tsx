import { getPosts, getLatestDiagnosis } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function StrategyPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  const [posts, diagnosis] = await Promise.all([getPosts(), getLatestDiagnosis()]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Funnel distribution
  const funnelStats = groupStats(inRange, "funnel_stage");
  const funnelOrder = ["TOFU", "MOFU", "BOFU"];
  const funnelDist = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    return { label: stage, value: s?.count || 0 };
  });
  const funnelEng = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    return { label: stage, value: Number((s?.avg_engagement_rate || 0).toFixed(2)) };
  });

  const whatHappened: string[] = diagnosis?.what_happened || [];
  const topPerformers = diagnosis?.top_performers || [];
  const underperformers = diagnosis?.underperformers || [];
  const watchOuts: string[] = diagnosis?.watch_outs || [];

  return (
    <div>
      <PageHeader title="Strategy" subtitle="Claude's diagnosis and recommended actions" dateLabel={range.label} />

      {/* Headline */}
      {diagnosis?.headline && (
        <Card className="mb-6 border-l-4 !border-l-slate-900">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Weekly verdict</div>
          <div className="text-xl text-slate-900 font-medium mt-2 leading-snug">{diagnosis.headline}</div>
          {diagnosis.exam_alert && (
            <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
              <span className="font-semibold text-brand-purple">Calendar alert: </span>
              {diagnosis.exam_alert}
            </div>
          )}
        </Card>
      )}

      {/* Funnel distribution */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Funnel Distribution"
          subtitle="Posts by marketing stage"
          definition="TOFU (top-of-funnel): awareness / education. MOFU (middle): consideration / demo. BOFU (bottom): direct conversion asks. Funnel stage is assigned by the weekly classifier."
          sampleSize={`n = ${inRange.length} posts`}
          caption="Heavy BOFU may limit new audience growth. Healthy mix is typically ~50% TOFU, ~30% MOFU, ~20% BOFU for organic."
        >
          <BarChartBase data={funnelDist} colorByIndex metricName="Posts" valueAxisLabel="Posts" categoryAxisLabel="Funnel stage" showPercent />
        </ChartCard>
        <ChartCard
          title="Funnel Engagement"
          subtitle="Avg engagement rate by stage"
          definition="For each funnel stage: total interactions ÷ total reach across all posts in that stage. Reach-weighted."
          caption="Which funnel stage resonates most in terms of interaction rate."
        >
          <BarChartBase data={funnelEng} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Funnel stage" />
        </ChartCard>
      </div>

      {/* Key findings: What happened */}
      {whatHappened.length > 0 && (
        <Card className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Key Findings</h3>
          <ul className="space-y-2">
            {whatHappened.map((item: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-brand-cyan mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Top performers + Underperformers */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <h3 className="text-base font-semibold text-slate-900 mb-3">Top Performers</h3>
          <div className="space-y-3">
            {topPerformers.length === 0 && <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>}
            {topPerformers.slice(0, 3).map((tp: any, i: number) => (
              <div key={i} className="border-l-2 border-brand-green pl-3 py-1">
                <div className="text-sm font-medium text-slate-900">{tp.metric_highlight}</div>
                {tp.why_it_worked && <div className="text-xs text-slate-600 mt-1">{tp.why_it_worked}</div>}
                {tp.replicable_elements && <div className="text-xs text-brand-cyan mt-1">Replicate: {tp.replicable_elements}</div>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-slate-900 mb-3">Underperformers</h3>
          <div className="space-y-3">
            {underperformers.length === 0 && <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>}
            {underperformers.slice(0, 3).map((up: any, i: number) => (
              <div key={i} className="border-l-2 border-brand-red pl-3 py-1">
                <div className="text-sm font-medium text-slate-900">{up.metric_highlight}</div>
                {up.why_it_failed && <div className="text-xs text-slate-600 mt-1">{up.why_it_failed}</div>}
                {up.lesson && <div className="text-xs text-brand-amber mt-1">Lesson: {up.lesson}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Watch-outs */}
      {watchOuts.length > 0 && (
        <Card className="border-l-4 !border-l-brand-amber">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Watch-outs</h3>
          <ul className="space-y-2">
            {watchOuts.map((item: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-brand-amber mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

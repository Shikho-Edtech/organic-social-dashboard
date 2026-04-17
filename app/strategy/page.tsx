import { getPosts, getLatestDiagnosis } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2R: collapse-first redesign.
// Previous pass coloured everything in but left the density untouched —
// every card still showed 3-4 stacked fields in bold near-black text.
// This version shows only the one-line headline at rest and tucks the
// rest behind a click. Colours downshifted: slate-800 for headlines,
// slate-600 for bodies; bold is reserved for short punchy lines.

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

  // Lift the first sentence so we can show it alone at rest and hide the rest.
  function splitHeadline(text: string): { head: string; body: string } {
    if (!text) return { head: "", body: "" };
    const idx = text.search(/\.\s+/);
    if (idx === -1 || idx > 140) return { head: text, body: "" };
    return { head: text.slice(0, idx + 1).trim(), body: text.slice(idx + 2).trim() };
  }

  return (
    <div>
      <PageHeader title="Strategy" subtitle="Claude's diagnosis and recommended actions" dateLabel={`${range.label} · Funnel charts filtered; verdict = latest weekly snapshot`} />

      {/* Weekly verdict — hero, short enough to always show */}
      {diagnosis?.headline && (
        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-brand-shikho-pink via-brand-shikho-orange to-brand-shikho-indigo" />
            <div className="flex-1 p-6">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-900 text-white">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Weekly verdict
                </span>
                <span className="text-[10px] text-slate-400">{diagnosis.week_ending ? `week ending ${diagnosis.week_ending}` : "latest weekly run"}</span>
              </div>
              <div className="text-lg lg:text-xl text-slate-800 font-semibold mt-3 leading-snug">{diagnosis.headline}</div>
              {diagnosis.exam_alert && (
                <details className="group mt-4">
                  <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-purple hover:text-brand-shikho-indigo">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    Calendar alert
                  </summary>
                  <div className="mt-2 text-sm text-slate-600 leading-relaxed pl-4 border-l-2 border-brand-purple/30">{diagnosis.exam_alert}</div>
                </details>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Funnel distribution */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Funnel Distribution"
          kind="ai"
          subtitle="Posts by marketing stage"
          definition="TOFU (top-of-funnel): awareness / education. MOFU (middle): consideration / demo. BOFU (bottom): direct conversion asks. Funnel stage is assigned by the weekly classifier."
          sampleSize={`n = ${inRange.length} posts`}
          caption="Heavy BOFU may limit new audience growth. Healthy mix is typically ~50% TOFU, ~30% MOFU, ~20% BOFU for organic."
        >
          <BarChartBase data={funnelDist} colorByIndex metricName="Posts" valueAxisLabel="Posts" categoryAxisLabel="Funnel stage" showPercent />
        </ChartCard>
        <ChartCard
          title="Funnel Engagement"
          kind="ai"
          subtitle="Avg engagement rate by stage"
          definition="For each funnel stage: total interactions ÷ total reach across all posts in that stage. Reach-weighted."
          caption="Which funnel stage resonates most in terms of interaction rate."
        >
          <BarChartBase data={funnelEng} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Funnel stage" />
        </ChartCard>
      </div>

      {/* Key findings — collapsed by default, click to expand */}
      {whatHappened.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-slate-800">Key Findings</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{whatHappened.length} · click to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {whatHappened.map((item, i) => {
              const { head, body } = splitHeadline(item);
              const hasDetail = Boolean(body);
              return (
                <details key={i} className={`group bg-white border border-slate-200 rounded-xl hover:border-brand-cyan/40 transition-colors ${hasDetail ? "open:border-brand-cyan/50" : ""}`}>
                  <summary className={`list-none ${hasDetail ? "cursor-pointer" : "cursor-default"} p-4`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-cyan/10 text-brand-cyan font-semibold text-xs flex items-center justify-center">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">
                        {head}
                      </div>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-400 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{body}</div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      )}

      {/* Top / Under performers — collapsed by default */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* Top */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Top Performers</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">click to expand</span>
          </div>
          <div className="space-y-2.5">
            {topPerformers.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </div>
            )}
            {topPerformers.slice(0, 3).map((tp: any, i: number) => {
              const { head } = splitHeadline(tp.metric_highlight || "");
              const hasDetail = Boolean(
                (tp.metric_highlight && tp.metric_highlight.length > head.length + 2) ||
                tp.why_it_worked || tp.replicable_elements
              );
              return (
                <details key={i} className="group bg-white border border-slate-200 rounded-xl border-l-4 !border-l-brand-green overflow-hidden">
                  <summary className={`list-none ${hasDetail ? "cursor-pointer" : "cursor-default"} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-md bg-brand-green/10 text-brand-green font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">
                        {head}
                      </div>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-13 space-y-3">
                      {tp.metric_highlight && tp.metric_highlight.length > head.length + 2 && (
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">
                          {splitHeadline(tp.metric_highlight).body}
                        </div>
                      )}
                      {tp.why_it_worked && (
                        <div className="pl-9">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Why it worked</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{tp.why_it_worked}</div>
                        </div>
                      )}
                      {tp.replicable_elements && (
                        <div className="pl-9 flex gap-2 items-start bg-brand-cyan/5 border border-brand-cyan/15 rounded-md p-2.5 -ml-0">
                          <span className="flex-shrink-0 mt-0.5 text-brand-cyan">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 11 12 14 22 4"></polyline>
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-cyan leading-relaxed">
                            <span className="font-semibold">Replicate: </span>{tp.replicable_elements}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>

        {/* Under */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-red/15 text-brand-red flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Underperformers</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">click to expand</span>
          </div>
          <div className="space-y-2.5">
            {underperformers.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </div>
            )}
            {underperformers.slice(0, 3).map((up: any, i: number) => {
              const { head } = splitHeadline(up.metric_highlight || "");
              const hasDetail = Boolean(
                (up.metric_highlight && up.metric_highlight.length > head.length + 2) ||
                up.why_it_failed || up.lesson
              );
              return (
                <details key={i} className="group bg-white border border-slate-200 rounded-xl border-l-4 !border-l-brand-red overflow-hidden">
                  <summary className={`list-none ${hasDetail ? "cursor-pointer" : "cursor-default"} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-md bg-brand-red/10 text-brand-red font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">
                        {head}
                      </div>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 space-y-3">
                      {up.metric_highlight && up.metric_highlight.length > head.length + 2 && (
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">
                          {splitHeadline(up.metric_highlight).body}
                        </div>
                      )}
                      {up.why_it_failed && (
                        <div className="pl-9">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Why it missed</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{up.why_it_failed}</div>
                        </div>
                      )}
                      {up.lesson && (
                        <div className="pl-9 flex gap-2 items-start bg-brand-amber/5 border border-brand-amber/20 rounded-md p-2.5">
                          <span className="flex-shrink-0 mt-0.5 text-brand-amber">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="16" x2="12" y2="12"></line>
                              <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-amber leading-relaxed">
                            <span className="font-semibold">Lesson: </span>{up.lesson}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      </div>

      {/* Watch-outs — collapsed by default */}
      {watchOuts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Watch-outs</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{watchOuts.length} · click to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {watchOuts.map((item, i) => {
              const { head, body } = splitHeadline(item);
              const hasDetail = Boolean(body);
              return (
                <details key={i} className="group bg-amber-50/30 border border-amber-200/60 rounded-xl hover:border-amber-300/80 transition-colors">
                  <summary className={`list-none ${hasDetail ? "cursor-pointer" : "cursor-default"} p-4`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">{head}</div>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-600/60 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{body}</div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

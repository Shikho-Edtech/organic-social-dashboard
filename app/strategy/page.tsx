import { getPosts, getLatestDiagnosis } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2Q: strategy page visual redesign.
// The old page was a wall of flat bullet text inside plain cards. This
// version adopts the same left-accent + colored-metric pattern that the
// Explore "Top 10" uses — proven scannable — and lifts the Weekly verdict,
// Key Findings, Top/Under performers, and Watch-outs out of block text
// into structured, numbered, color-coded chunks.

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

  // Split a finding / performer blob into a bold lead sentence + body.
  // Most Claude findings start with a factual claim then expand; lifting
  // the first sentence into a darker weight gives the card a headline.
  function splitHeadline(text: string): { head: string; body: string } {
    if (!text) return { head: "", body: "" };
    // First sentence up to the first ". " or the whole string if short.
    const idx = text.search(/\.\s+/);
    if (idx === -1 || idx > 160) return { head: text, body: "" };
    return { head: text.slice(0, idx + 1).trim(), body: text.slice(idx + 2).trim() };
  }

  return (
    <div>
      <PageHeader title="Strategy" subtitle="Claude's diagnosis and recommended actions" dateLabel={`${range.label} · Funnel charts filtered; verdict = latest weekly snapshot`} />

      {/* Weekly verdict — hero treatment with gradient accent stripe */}
      {diagnosis?.headline && (
        <Card className="mb-6 !p-0 overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-brand-shikho-pink via-brand-shikho-orange to-brand-shikho-indigo" />
            <div className="flex-1 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-slate-900 text-white">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Weekly verdict
                  </span>
                  <span className="text-[10px] text-slate-400">{diagnosis.week_ending ? `week ending ${diagnosis.week_ending}` : "latest weekly run"}</span>
                </div>
              </div>
              <div className="text-xl lg:text-2xl text-slate-900 font-semibold mt-3 leading-snug">{diagnosis.headline}</div>
              {diagnosis.exam_alert && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-purple/10 text-brand-purple flex items-center justify-center mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-purple">Calendar alert</div>
                    <div className="text-sm text-slate-700 mt-0.5 leading-relaxed">{diagnosis.exam_alert}</div>
                  </div>
                </div>
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

      {/* Key findings — numbered grid cards */}
      {whatHappened.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-semibold text-slate-900">Key Findings</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{whatHappened.length} insight{whatHappened.length > 1 ? "s" : ""}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {whatHappened.map((item, i) => {
              const { head, body } = splitHeadline(item);
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-cyan/40 transition-colors">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-cyan/10 text-brand-cyan font-semibold text-xs flex items-center justify-center">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 font-medium leading-snug">{head}</div>
                      {body && <div className="text-xs text-slate-600 mt-1.5 leading-relaxed">{body}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top performers + Underperformers — 3 ranked cards each, side-by-side on desktop */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">Top Performers</h3>
          </div>
          <div className="space-y-3">
            {topPerformers.length === 0 && (
              <Card className="text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </Card>
            )}
            {topPerformers.slice(0, 3).map((tp: any, i: number) => {
              const { head, body } = splitHeadline(tp.metric_highlight || "");
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 border-l-4 !border-l-brand-green">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-green text-white font-bold text-sm flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 leading-snug">{head}</div>
                      {body && <div className="text-xs text-slate-600 mt-1 leading-relaxed">{body}</div>}
                      {tp.why_it_worked && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it worked</div>
                          <div className="text-xs text-slate-700 leading-relaxed">{tp.why_it_worked}</div>
                        </div>
                      )}
                      {tp.replicable_elements && (
                        <div className="mt-2 flex gap-1.5 items-start">
                          <span className="flex-shrink-0 mt-0.5 text-brand-cyan">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 11 12 14 22 4"></polyline>
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-cyan font-medium leading-relaxed">{tp.replicable_elements}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-red/15 text-brand-red flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900">Underperformers</h3>
          </div>
          <div className="space-y-3">
            {underperformers.length === 0 && (
              <Card className="text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </Card>
            )}
            {underperformers.slice(0, 3).map((up: any, i: number) => {
              const { head, body } = splitHeadline(up.metric_highlight || "");
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 border-l-4 !border-l-brand-red">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-red text-white font-bold text-sm flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 leading-snug">{head}</div>
                      {body && <div className="text-xs text-slate-600 mt-1 leading-relaxed">{body}</div>}
                      {up.why_it_failed && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it missed</div>
                          <div className="text-xs text-slate-700 leading-relaxed">{up.why_it_failed}</div>
                        </div>
                      )}
                      {up.lesson && (
                        <div className="mt-2 flex gap-1.5 items-start">
                          <span className="flex-shrink-0 mt-0.5 text-brand-amber">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2l1.09 3.36L16.5 6l-2.73 2.64L14.36 12 12 10.14 9.64 12l.59-3.36L7.5 6l3.41-.64L12 2z"/>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-amber font-medium leading-relaxed">{up.lesson}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Watch-outs — amber alert cards */}
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
            <h3 className="text-base font-semibold text-slate-900">Watch-outs</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{watchOuts.length} risk{watchOuts.length > 1 ? "s" : ""}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {watchOuts.map((item, i) => {
              const { head, body } = splitHeadline(item);
              return (
                <div key={i} className="bg-amber-50/40 border border-amber-200/70 rounded-xl p-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <circle cx="12" cy="17" r="0.5" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 leading-snug">{head}</div>
                      {body && <div className="text-xs text-slate-700 mt-1 leading-relaxed">{body}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
